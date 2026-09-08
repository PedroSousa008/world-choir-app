/**
 * Notification dispatch queue — chunked sends for Vercel serverless limits.
 *
 * Jobs: wc-data/owner/notifications/jobs/{campaignId}.json
 * Cron drains scheduled campaigns + in-progress jobs.
 */
const { writeJson, readBlobJson } = require('./store');
const { resolveRecipients } = require('./push-subscriptions');
const { dispatchToSubscriptions, getProviderStatus, isDispatchEnabled } = require('./push-provider');

const JOB_ROOT = 'wc-data/owner/notifications/jobs';
const BATCH_SIZE = 40;

function nowIso() {
  return new Date().toISOString();
}

function jobPath(campaignId) {
  return `${JOB_ROOT}/${encodeURIComponent(campaignId)}.json`;
}

async function readJob(campaignId) {
  try {
    return await readBlobJson(jobPath(campaignId));
  } catch {
    return null;
  }
}

async function writeJob(job) {
  await writeJson(jobPath(job.campaignId), job);
  return job;
}

async function createDispatchJob(campaign, recipients) {
  const job = {
    campaignId: campaign.id,
    status: 'queued',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    cursor: 0,
    batchSize: BATCH_SIZE,
    recipientSnapshot: recipients.map((r) => ({
      id: r.id,
      provider: r.provider,
      deviceId: r.deviceId,
      // Keep delivery credentials inside the job snapshot for worker isolation.
      endpoint: r.endpoint || null,
      keys: r.keys || null,
      expoPushToken: r.expoPushToken || null,
    })),
    totals: {
      targeted: recipients.length,
      attempted: 0,
      delivered: 0,
      failed: 0,
    },
    lastError: null,
  };
  await writeJob(job);
  return job;
}

/**
 * Process up to one batch for a campaign job. Returns updated job + campaign metric deltas.
 */
async function processJobBatch(campaign, { dryRun } = {}) {
  let job = await readJob(campaign.id);
  if (!job) {
    const { recipients } = await resolveRecipients(campaign.audience || { mode: 'everyone' });
    job = await createDispatchJob(campaign, recipients);
  }

  if (job.status === 'completed' || job.status === 'cancelled') {
    return { job, done: true, delta: { delivered: 0, failed: 0, attempted: 0 } };
  }

  job.status = 'processing';
  job.updatedAt = nowIso();

  const start = job.cursor || 0;
  const slice = (job.recipientSnapshot || []).slice(start, start + (job.batchSize || BATCH_SIZE));
  if (!slice.length) {
    job.status = 'completed';
    job.completedAt = nowIso();
    await writeJob(job);
    return { job, done: true, delta: { delivered: 0, failed: 0, attempted: 0 } };
  }

  const { results } = await dispatchToSubscriptions(slice, campaign, { dryRun });
  let delivered = 0;
  let failed = 0;
  for (const r of results) {
    if (r.ok) delivered += 1;
    else failed += 1;
  }

  job.cursor = start + slice.length;
  job.totals.attempted += slice.length;
  job.totals.delivered += delivered;
  job.totals.failed += failed;
  job.updatedAt = nowIso();

  if (job.cursor >= (job.recipientSnapshot || []).length) {
    job.status = 'completed';
    job.completedAt = nowIso();
  }

  await writeJob(job);
  return {
    job,
    done: job.status === 'completed',
    delta: { delivered, failed, attempted: slice.length },
  };
}

function shouldFireScheduled(campaign, now = new Date()) {
  if (campaign.status !== 'scheduled') return false;
  if (!campaign.scheduled_at) return false;
  const when = new Date(campaign.scheduled_at);
  if (Number.isNaN(when.getTime())) return false;

  if (campaign.timezone_mode === 'recipient_local') {
    // Recipient-local fan-out needs per-user timezone matching.
    // Until then, fire at the stored UTC instant (Owner should prefer Global UTC for sync events).
    return when.getTime() <= now.getTime();
  }
  return when.getTime() <= now.getTime();
}

/**
 * Owner-notifications helpers expected by the cron worker / send path.
 * Mutators are injected to avoid circular requires.
 */
async function enqueueCampaignSend(campaign, {
  readIndex,
  writeIndex,
  appendAudit,
  emptyMetrics,
  actor,
  ownerTestOnly = false,
} = {}) {
  const providers = getProviderStatus();
  const { recipients } = await resolveRecipients(campaign.audience || { mode: 'everyone' }, {
    ownerTestOnly,
  });

  const index = await readIndex();
  const row = index.campaigns.find((c) => c.id === campaign.id);
  if (!row) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }

  row.status = 'sending';
  row.updated_at = nowIso();
  row.scheduled_at = null;
  row.dispatchMode = 'queued';
  row.providerStatus = providers.pushConfigured
    ? (isDispatchEnabled() ? 'dispatching' : 'dry_run')
    : 'not_configured';
  row.estimated_audience = recipients.length;
  row.metrics = {
    ...emptyMetrics(),
    ...(row.metrics || {}),
    targeted_count: recipients.length,
    sent_count: 0,
    delivered_count: 0,
    failed_count: 0,
  };
  index.campaigns = index.campaigns.map((c) => (c.id === row.id ? row : c));
  await writeIndex(index);

  const job = await createDispatchJob(row, recipients);
  if (appendAudit) {
    await appendAudit({
      action: 'queued',
      actor: actor || 'owner',
      notificationId: row.id,
      meta: {
        recipients: recipients.length,
        dispatchEnabled: isDispatchEnabled(),
        pushConfigured: providers.pushConfigured,
      },
    });
  }

  // Process first batch immediately so small audiences deliver without waiting for cron.
  const batch = await processJobBatch(row, { dryRun: !isDispatchEnabled() && !providers.pushConfigured });
  await applyBatchToCampaign(row.id, batch, { readIndex, writeIndex, appendAudit, actor });

  const freshIndex = await readIndex();
  const fresh = freshIndex.campaigns.find((c) => c.id === row.id);
  return {
    campaign: fresh,
    job: batch.job,
    dispatch: {
      mode: 'queued',
      devicesTargeted: recipients.length,
      devicesNotified: batch.job.totals.delivered,
      done: batch.done,
      dispatchEnabled: isDispatchEnabled(),
      pushConfigured: providers.pushConfigured,
      message: batch.done
        ? (isDispatchEnabled()
          ? `Delivered to ${batch.job.totals.delivered} device(s); ${batch.job.totals.failed} failed.`
          : `Queued dry-run completed for ${recipients.length} subscription(s). Set PUSH_DISPATCH_ENABLED=true and VAPID keys for live delivery.`)
        : `Queued for ${recipients.length} device(s). Cron will continue delivery in batches.`,
    },
  };
}

async function applyBatchToCampaign(campaignId, batch, { readIndex, writeIndex, appendAudit, actor }) {
  const index = await readIndex();
  const row = index.campaigns.find((c) => c.id === campaignId);
  if (!row) return null;

  row.metrics = {
    ...(row.metrics || {}),
    targeted_count: batch.job.totals.targeted,
    sent_count: batch.job.totals.attempted,
    delivered_count: batch.job.totals.delivered,
    failed_count: batch.job.totals.failed,
    denominator: batch.job.totals.delivered > 0 ? 'delivered' : 'sent',
  };
  row.updated_at = nowIso();

  if (batch.done) {
    row.status = 'sent';
    row.sent_at = row.sent_at || nowIso();
    row.providerStatus = isDispatchEnabled() ? 'completed' : 'dry_run_completed';
    row.dispatchMode = 'queued';
    if (appendAudit) {
      await appendAudit({
        action: 'sent',
        actor: actor || 'system',
        notificationId: campaignId,
        meta: { ...batch.job.totals, dispatchEnabled: isDispatchEnabled() },
      });
    }
  } else {
    row.status = 'sending';
    row.providerStatus = 'dispatching';
  }

  index.campaigns = index.campaigns.map((c) => (c.id === campaignId ? row : c));
  await writeIndex(index);
  return row;
}

async function processDueCampaigns({
  readIndex,
  writeIndex,
  appendAudit,
  emptyMetrics,
  maxCampaigns = 3,
  maxBatches = 6,
} = {}) {
  const index = await readIndex();
  const report = {
    scheduledStarted: 0,
    batchesProcessed: 0,
    completed: 0,
    dispatchEnabled: isDispatchEnabled(),
    providers: getProviderStatus(),
  };

  // Start due scheduled campaigns.
  for (const campaign of index.campaigns) {
    if (report.scheduledStarted >= maxCampaigns) break;
    if (!shouldFireScheduled(campaign)) continue;
    await enqueueCampaignSend(campaign, {
      readIndex,
      writeIndex,
      appendAudit,
      emptyMetrics,
      actor: 'cron',
    });
    report.scheduledStarted += 1;
  }

  // Continue in-flight sending jobs.
  const fresh = await readIndex();
  for (const campaign of fresh.campaigns) {
    if (report.batchesProcessed >= maxBatches) break;
    if (campaign.status !== 'sending') continue;
    const batch = await processJobBatch(campaign, {
      dryRun: !isDispatchEnabled() && !getProviderStatus().pushConfigured,
    });
    await applyBatchToCampaign(campaign.id, batch, {
      readIndex,
      writeIndex,
      appendAudit,
      actor: 'cron',
    });
    report.batchesProcessed += 1;
    if (batch.done) report.completed += 1;
  }

  return report;
}

module.exports = {
  createDispatchJob,
  readJob,
  processJobBatch,
  shouldFireScheduled,
  enqueueCampaignSend,
  processDueCampaigns,
  BATCH_SIZE,
};
