#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAP_PATH = path.join(ROOT, 'api/data/daily-act-images.json');
const TXT_PATH = path.join(ROOT, 'docs/daily-act-unsplash-assignments.txt');
const CSV_PATH = path.join(ROOT, 'docs/daily-act-unsplash-assignments.csv');

const RAW = `dap-021 | https://unsplash.com/photos/a-couple-of-people-that-are-hugging-each-other-8_QVYlFKlh4 | Send encouragement to someone going through a difficult time.
dap-022 | https://unsplash.com/photos/a-group-of-people-standing-next-to-each-other-ti8cT-DKwes | Tell someone you are proud of them.
dap-024 | https://unsplash.com/photos/two-cafe-owners-proudly-stand-together-dU3KJqyYlO0 | Leave a positive review for a small business you love.
dap-025 | https://unsplash.com/photos/woman-and-child-reading-in-library-7fF0iei80AQ | Thank a teacher who helped you.
dap-026 | https://unsplash.com/photos/a-man-and-woman-kissing-maDPeafRzQ0 | Thank someone from your past who made a difference.
dap-027 | https://unsplash.com/photos/a-couple-of-women-standing-next-to-each-other-KRhtGeSupJg | Ask someone about something they care deeply about.
dap-032 | https://unsplash.com/photos/three-women-talking-and-smiling-in-a-room-4O7MT3s9ElY | Ask an older person to tell you a story from their life.
dap-034 | https://unsplash.com/photos/two-women-sitting-on-the-beach-pointing-at-the-camera-aMPjULm0XzI | Tell a friend what makes them special.
dap-035 | https://unsplash.com/photos/young-woman-wearing-headphones-and-using-phone-on-bed-NzEdxXqvFww | Send someone a song that reminds you of them.
dap-044 | https://unsplash.com/photos/two-man-laughing-at-each-other-FHiJWoBodrs | Ask someone what they need today.
dap-045 | https://unsplash.com/photos/man-hugging-woman-near-trees-BCyfpZE3aVE | Give a genuine apology if you owe one.
dap-048 | https://unsplash.com/photos/couple-looking-at-each-other-while-holding-hands-wPAmA768vf4 | Tell someone about a positive impact they had on you.
dap-050 | https://unsplash.com/photos/a-man-and-a-woman-laying-a-rug-on-the-floor-S_uTzflaB0s | Do one small thing that makes someone’s day easier.
dap-051 | https://unsplash.com/photos/man-with-red-hair-talking-on-a-cell-phone-tcuLaHhxNSM | Call a family member just to talk.
dap-052 | https://unsplash.com/photos/three-people-having-a-toast-on-table-wYOPqmtDD0w | Eat a meal with someone without looking at your phone.
dap-054 | https://unsplash.com/photos/man-and-woman-by-open-range-oven-5we-PtvuCyE | Help with a household task without being asked.
dap-056 | https://unsplash.com/photos/two-girls-running-on-a-wet-sandy-beach-at-sunset-yuD5m0kh39U | Tell a sibling or close friend a favorite memory you have with them.
dap-058 | https://unsplash.com/photos/a-man-reaching-out-his-hand-to-another-man-on-top-of-a-rock-JYfLlOKRMaE | Ask someone, “How can I support you today?”
dap-060 | https://unsplash.com/photos/man-in-white-turtleneck-sweater-holding-smartphone-HT6AFKBcfVA | Send a “good morning” message to someone who matters to you.
dap-061 | https://unsplash.com/photos/a-couple-of-men-standing-next-to-each-other-eA8A7otEjIQ | End the day by thanking someone you live with.
dap-062 | https://unsplash.com/photos/man-wearing-brown-jacket-YCM4DM7TCl8 | Ask someone about a dream they still have.
dap-063 | https://unsplash.com/photos/children-playing-soccer-in-a-sunny-park-y_sf8j3K2ZY | Recreate a happy memory with someone.
dap-064 | https://unsplash.com/photos/group-of-people-hugging-themselves-1TuZF_ma87A | Tell someone why you are grateful they are in your life.
dap-065 | https://unsplash.com/photos/man-and-woman-hugging-near-trees-Jqk9QJgmH0Q | Give someone a long, real hug.
dap-074 | https://unsplash.com/photos/a-woman-sitting-at-a-table-talking-to-another-woman-eXaHkicU3wo | Ask someone how they are feeling today.
dap-075 | https://unsplash.com/photos/man-gives-woman-a-bouquet-of-pink-roses-v1vijninZLc | Surprise someone with their favorite small thing.
dap-078 | https://unsplash.com/photos/person-writing-on-white-paper-Ak5c5VTch5E | Write down five things you love about someone.
dap-081 | https://unsplash.com/photos/man-in-black-long-sleeve-shirt-and-gray-pants-sitting-on-black-metal-railings-during-daytime-wJyp9ueZZ7s | Reach out to someone you lost touch with.
dap-082 | https://unsplash.com/photos/a-woman-sitting-at-a-table-looking-at-her-cell-phone-eL4xIEuHzzk | Send a message to an old friend.
dap-083 | https://unsplash.com/photos/a-couple-of-people-sitting-on-top-of-a-grass-covered-field-MuQxPoy7AHk | Ask someone you miss how life has been.
dap-084 | https://unsplash.com/photos/two-women-and-a-husky-dog-outdoors-gWhEB-1Wceg | Thank someone from your past.
dap-085 | https://unsplash.com/photos/woman-in-red-long-sleeve-shirt-sitting-beside-woman-in-white-long-sleeve-shirt-4ixi6kpRyaQ | Reconnect with someone you once cared about.
dap-086 | https://unsplash.com/photos/man-and-woman-hugging-SK5GIyya_Jk | Apologize to someone if you know you hurt them.
dap-088 | https://unsplash.com/photos/man-in-train-holding-smartphone-oqY09oVTa3k | Write a message you have been afraid to send.
dap-089 | https://unsplash.com/photos/a-person-holding-a-phone-664eGz6v0sg | Check on someone you have not spoken to in over a year.
dap-090 | https://unsplash.com/photos/a-man-and-a-woman-sitting-at-a-table-zTjVhEKkhRc | Invite someone for a coffee or a walk.
dap-091 | https://unsplash.com/photos/man-using-ip-phone-inside-room-WEDDt-u3q3o | Tell someone you miss them.
dap-092 | https://unsplash.com/photos/young-woman-using-a-smartphone-while-sitting-on-a-couch-MBg7jCxFnjo | Send someone an unexpected memory.
dap-093 | https://unsplash.com/photos/young-woman-smiling-while-using-her-smartphone-in-bed-fKxTOjnWebo | Ask an old friend to catch up.
dap-094 | https://unsplash.com/photos/couple-looking-at-each-other-while-holding-hands-wPAmA768vf4 | Thank someone for a lesson they taught you.
dap-095 | https://unsplash.com/photos/a-group-of-people-standing-outside-BMovZvj7-ow | Reconnect without expecting anything in return.
dap-096 | https://unsplash.com/photos/a-woman-sitting-on-a-couch-talking-to-a-man-rf1-7M95Tes | Make peace with someone over a small disagreement.
dap-099 | https://unsplash.com/photos/two-women-sitting-at-a-table-talking-to-each-other-5qTt2G-JzUw | Tell someone from your past that you hope they are doing well.
dap-100 | https://unsplash.com/photos/woman-in-white-dress-standing-on-gray-concrete-floor-during-daytime-zTWfuNgAOqk | Reach out to someone who might be feeling alone.
dap-103 | https://unsplash.com/photos/a-group-of-people-standing-around-a-table-BlzrvWb1_vQ | Donate something you no longer use.
dap-104 | https://unsplash.com/photos/women-packing-food-bags-at-distribution-Cns0h4ypRyA | Give food or useful items to someone in need.
dap-105 | https://unsplash.com/photos/construction-workers-shake-hands-after-a-deal-1sv3PJYtn88 | Support a local small business.
dap-106 | https://unsplash.com/photos/man-in-suit-holding-clipboard-talking-to-woman-w7rKpNn53t4 | Leave a generous review for a good local business.
dap-107 | https://unsplash.com/photos/two-businessmen-in-suits-talking-at-a-table-K7T68ZLCtwk | Learn the name of someone who works in your building or neighborhood.
dap-108 | https://unsplash.com/photos/man-in-blue-crew-neck-t-shirt-standing-beside-brown-cardboard-boxes-tnVdQGmWtb0 | Help a neighbor with something small.
dap-111 | https://unsplash.com/photos/man-in-blue-shirt-sitting-on-sand-during-daytime-xch7jXAaqqo | Leave a place cleaner than you found it.
dap-112 | https://unsplash.com/photos/two-women-hanging-laundry-on-a-rooftop-SxdLwGYXAqo | Donate clothes you no longer wear.
dap-113 | https://unsplash.com/photos/a-group-of-people-holding-plates-of-food-Glt7d_fofLQ | Bring food to someone who needs support.
dap-114 | https://unsplash.com/photos/white-and-blue-plastic-packs-WXnBzI7AypY | Give away something useful instead of throwing it away.
dap-117 | https://unsplash.com/photos/a-man-in-a-turban-is-preparing-food-04OgKea3bkQ | Support a local cause.
dap-120 | https://unsplash.com/photos/two-young-boys-reading-a-book-together-outdoors-_5v4rEX1cNU | Donate books you no longer read.
dap-125 | https://unsplash.com/photos/person-on-chair-donating-blood-X20g2GQsVdA | Give blood if you are able and eligible.
dap-126 | https://unsplash.com/photos/children-on-brown-soil-Xavq7lKj5j8 | Donate to a cause you genuinely trust, if you can.
dap-127 | https://unsplash.com/photos/a-couple-of-children-carrying-baskets-on-their-heads-8DBvBmGVLNc | Help someone carry their shopping.
dap-128 | https://unsplash.com/photos/adult-and-child-walking-on-path-snDUMdYF7o8 | Check whether an elderly neighbor needs anything.
dap-129 | https://unsplash.com/photos/two-women-waving-at-a-tablet-screen-pT-CMHpVONg | Let someone know about an opportunity they might benefit from.
dap-130 | https://unsplash.com/photos/a-couple-of-people-that-are-holding-a-bag--74B6XNGuYo | Give useful items directly to someone who needs them.
dap-132 | https://unsplash.com/photos/man-holding-ballpoint-pen-PnErHCrtXnw | Leave a kind note for someone to find.
dap-133 | https://unsplash.com/photos/two-women-talking-while-looking-at-laptop-computer-7okkFhxrxNw | Support someone’s small project.
dap-134 | https://unsplash.com/photos/two-women-are-looking-over-papers-USEUd1wHfZg | Recommend someone’s work.
dap-135 | https://unsplash.com/photos/two-women-in-an-office-looking-at-a-laptop-OBnHQsK9JPg | Share a job or opportunity with someone who could benefit.
dap-136 | https://unsplash.com/photos/man-in-black-jacket-riding-motorcycle-jm70AzcV5AQ | Thank a cleaner, delivery worker, or service worker.
dap-141 | https://unsplash.com/photos/person-in-blue-t-shirt-holding-white-textile-EPPS6W5LdXs | Take a walk and pick up litter along the way.
dap-143 | https://unsplash.com/photos/man-and-woman-walking-on-sidewalk-during-daytime-l4jueTOWzeI | Walk somewhere instead of driving, if possible.
dap-145 | https://unsplash.com/photos/topless-woman-in-black-and-white-floral-skirt-4xlQ0LrcilQ | Take a shorter shower.
dap-148 | https://unsplash.com/photos/a-couple-of-people-riding-bikes-down-a-street-G-yqWK08za0 | Recycle properly today.
dap-149 | https://unsplash.com/photos/a-couple-of-people-that-are-kneeling-down-in-the-dirt-z6zG_FTBw0s | Plant something.
dap-150 | https://unsplash.com/photos/woman-watering-plant-beside-window-EOJRrenjc4c | Water a plant.
dap-153 | https://unsplash.com/photos/woman-in-white-coat-holding-green-shopping-cart-Gk8LG7dsHWA | Take your own bag when shopping.
dap-157 | https://unsplash.com/photos/a-group-of-men-standing-around-each-other-holding-a-box-wTJeRSnV4vs | Give an unwanted item a second life.
dap-159 | https://unsplash.com/photos/person-sitting-on-hill-near-ocean-during-daytime-RFgO9B_OR4g | Spend time in nature without your phone.
dap-161 | https://unsplash.com/photos/people-feeding-swans-and-ducks-by-a-calm-lake-SHKMGNJJnps | Feed birds safely and responsibly.
dap-162 | https://unsplash.com/photos/people-sitting-on-wooden-fence-near-white-swan-during-daytime-2b-P_jWjh7I | Support a project that protects nature.
dap-172 | https://unsplash.com/photos/a-group-of-people-walking-through-a-lush-green-park-V0_LdCtR4gw | Go for a walk without listening to anything.
dap-173 | https://unsplash.com/photos/woman-sitting-in-front-of-black-table-writing-on-white-book-near-window-NXiIVnzBwZ8 | Write down three things that went well today.
dap-176 | https://unsplash.com/photos/a-person-lying-in-a-bed-tgMKcE-Qo5o | Get enough sleep tonight.
dap-179 | https://unsplash.com/photos/man-in-black-t-shirt-writing-on-white-paper-BPZ1huYak7c | Write down one thing you are grateful for.
dap-180 | https://unsplash.com/photos/a-couple-sitting-on-a-bench-T3WIvhGcXHc | Spend time alone without distracting yourself.
dap-185 | https://unsplash.com/photos/smiling-man-with-green-mountaineering-bag-during-daytime-3Y366aqddJ0 | Stop comparing yourself to someone today.
dap-186 | https://unsplash.com/photos/a-person-sitting-on-the-floor-writing-on-a-notebook-XVtWhPS-hic | Write down something you are proud of.
dap-188 | https://unsplash.com/photos/man-hugging-woman-near-trees-BCyfpZE3aVE | Do something you have been putting off that will make you feel better.
dap-189 | https://unsplash.com/photos/woman-makes-the-bed-in-a-stylish-modern-bedroom-YZxGx9hAivY | Clean a space that has been bothering you.
dap-193 | https://unsplash.com/photos/a-group-of-people-standing-on-top-of-a-bridge-8FqNbhj6YfA | Watch the sunrise or sunset.
dap-194 | https://unsplash.com/photos/fountain-pen-on-black-lined-paper-y02jEX_B0O0 | Write a letter to your future self.
dap-195 | https://unsplash.com/photos/woman-wearing-brown-sweater-holding-lips-3B6RfJQKBEM | Remember a moment you overcame something difficult.
dap-208 | https://unsplash.com/photos/three-men-and-one-woman-laughing-during-daytime-e3OUQGT9bWU | Avoid gossip for one day.
dap-243 | https://unsplash.com/photos/people-laughing-and-talking-outside-during-daytime-nF8xhLMmg0c | Introduce two people who could help each other.
dap-244 | https://unsplash.com/photos/a-group-of-people-sitting-around-a-wooden-table-8Fbdi6AcHVs | Recommend someone for an opportunity.
dap-246 | https://unsplash.com/photos/man-and-woman-laughing-surrounded-with-green-grass-during-daytime-GvIZU9SvrKg | Help someone feel more confident.
dap-249 | https://unsplash.com/photos/man-carrying-woman-on-back-TmTYtJ5RiN8 | Help someone without expecting credit.
dap-250 | https://unsplash.com/photos/man-and-woman-holding-hand-together-while-stepping-on-rocks-near-sea-s7pxXFY9Pwk | Do something kind anonymously.
dap-259 | https://unsplash.com/photos/a-couple-of-people-standing-next-to-each-other-OFJZjKDuXcY | Start a conversation with someone you normally would not approach.
dap-263 | https://unsplash.com/photos/couple-looks-at-each-other-lovingly-in-a-field-3qKpnFMcNdM | Tell someone you love them.
dap-268 | https://unsplash.com/photos/a-man-and-woman-embracing-each-other-near-the-ocean-eQ50ItjvEM4 | Give someone another chance.
dap-269 | https://unsplash.com/photos/two-people-sitting-on-a-bench-in-front-of-a-fountain--YEG1dixmqs | Stand beside someone who is alone.
dap-271 | https://unsplash.com/photos/a-couple-of-men-sitting-on-top-of-a-blue-bench-FqFVgoN-CEU | Reach out to someone you had an argument with.
dap-275 | https://unsplash.com/photos/a-group-of-people-sitting-on-top-of-a-wooden-bench-MQCoPbIrPBI | Start repairing a relationship that matters to you.
dap-276 | https://unsplash.com/photos/a-woman-laughing-while-sitting-in-a-chair-24_Wq5a8m_Q | Send someone a funny video you know they will love.
dap-277 | https://unsplash.com/photos/woman-in-pink-crew-neck-shirt-beside-man-in-yellow-crew-neck-shirt-WfnP_CFPybo | Bring someone their favorite snack.
dap-278 | https://unsplash.com/photos/two-young-women-singing-and-playing-guitar-together-lbqfafLy65Y | Play a song that makes someone smile.
dap-280 | https://unsplash.com/photos/smiling-man-standing-while-using-phone-eS1hRrh_xhc | Share a happy memory.
dap-281 | https://unsplash.com/photos/man-giving-woman-bouquet-of-pink-roses-YWyKcSN3MmI | Surprise someone with a small gesture.
dap-282 | https://unsplash.com/photos/man-gives-woman-flowers-in-front-of-dark-background-ek6sBFcXQWw | Give someone flowers — picked, bought, or homemade.
dap-283 | https://unsplash.com/photos/man-in-black-jacket-sitting-on-chair-iC5f0oZNTLw | Make a playlist for someone.
dap-284 | https://unsplash.com/photos/a-man-looking-at-his-cell-phone-and-laughing-N9fGkZBXNvY | Send someone a photo that will make them smile.
dap-285 | https://unsplash.com/photos/a-man-and-woman-smiling-_Df9QWzSv_A | Tell someone your favorite thing about them.
dap-286 | https://unsplash.com/photos/boy-in-black-long-sleeve-shirt-and-blue-pants-playing-with-blue-plastic-container-during-daytime-CBnSTRvnfCE | Invite someone to do something fun.
dap-287 | https://unsplash.com/photos/diverse-team-celebrating-success-at-office-desk-jPLvaZ06uy0 | Share good news with someone who will celebrate it with you.
dap-288 | https://unsplash.com/photos/group-of-colleagues-taking-a-selfie-in-the-office-o5nf0dftqaQ | Celebrate a small achievement.
dap-289 | https://unsplash.com/photos/woman-in-white-dress-shirt-writing-on-white-paper-6Tms8qn3-VE | Write a note that makes someone smile.
dap-291 | https://unsplash.com/photos/2-women-sitting-on-blue-leather-chair-holding-white-and-red-plastic-cups-4VDRCoNuvE0 | Ask someone to join you instead of doing something alone.
dap-292 | https://unsplash.com/photos/man-in-white-dress-shirt-sitting-beside-woman-in-black-long-sleeve-shirt-376KN_ISplE | Bring energy to a room instead of negativity.
dap-295 | https://unsplash.com/photos/man-in-blue-and-white-checkered-button-up-shirt-holding-white-ceramic-mug-QdDER-pLd8k | Surprise someone with coffee, tea, or something they enjoy.
dap-296 | https://unsplash.com/photos/a-group-of-people-taking-a-picture-together-sr4xtO90tUM | Create a small moment worth remembering.
dap-297 | https://unsplash.com/photos/group-of-people-dancing-6Woj_wozqmA | Dance or sing with someone.
dap-298 | https://unsplash.com/photos/four-friends-laughing-and-high-fiving-over-coffee-l_ExpFwwOEg | Tell someone a happy memory you share.
dap-299 | https://unsplash.com/photos/man-and-woman-kissing-during-daytime-ila2EciR6DY | Make someone feel seen.
dap-300 | https://unsplash.com/photos/smiling-man-in-rust-colored-shirt-abGfK2e7m0s | Give someone a reason to smile today.
dap-301 | https://unsplash.com/photos/three-smiling-friends-stand-together-outdoors-U9CJ5lOfnn4 | Learn something about another culture.
dap-302 | https://unsplash.com/photos/woman-dancing-on-bed-wearing-headphones-and-singing-XxplPRmgDRI | Listen to music from a country you know little about.
dap-303 | https://unsplash.com/photos/man-reading-book-akocAO9QCHM | Learn how to say “thank you” in a new language.
dap-304 | https://unsplash.com/photos/woman-in-white-shirt-eating-CAhjZmVk5H4 | Try food from a different culture.
dap-305 | https://unsplash.com/photos/person-reading-book-in-library-DfrGxT0YWUE | Read about a place you have never visited.
dap-306 | https://unsplash.com/photos/man-in-sunglasses-talks-to-woman-in-red-beret-outdoors-o8SsfbQ1COQ | Have a conversation with someone whose life experience differs from yours.
dap-307 | https://unsplash.com/photos/two-women-talking-at-a-cafe-table-gRmyW5p_4lQ | Ask someone about a tradition that matters to them.
dap-308 | https://unsplash.com/photos/woman-reading-book-sitting-beside-electronic-keyboard-oCPDom0y_yI | Learn one fact that changes how you see another part of the world.
dap-309 | https://unsplash.com/photos/a-man-holding-a-cell-phone-up-to-his-face-VcrjDmTUKFg | Follow a creator who teaches you something outside your usual perspective.
dap-310 | https://unsplash.com/photos/man-clapping-hands-with-an-elderly-woman-za32INDZ1JI | Listen to a story from someone older or younger than you.
dap-311 | https://unsplash.com/photos/a-man-and-a-woman-looking-at-a-book-920yOnO_wok | Learn about a community you know little about.
dap-312 | https://unsplash.com/photos/a-man-and-a-woman-standing-next-to-each-other-rjzW_IIjBJc | Find something you have in common with someone different from you.
dap-314 | https://unsplash.com/photos/a-man-sitting-at-a-table-reading-a-newspaper-ou-MszyjNew | Read an article from a country outside your own.
dap-316 | https://unsplash.com/photos/a-woman-sitting-on-a-bench-reading-a-book-sLv7ra9ab18 | Learn the history behind a place near you.
dap-317 | https://unsplash.com/photos/man-wearing-brown-jacket-YCM4DM7TCl8 | Ask someone where they feel most at home.
dap-318 | https://unsplash.com/photos/woman-in-white-crew-neck-t-shirt-sitting-on-black-couch-U9CJ5lOfnn4 | Share something positive from your culture with someone.
dap-319 | https://unsplash.com/photos/a-group-of-people-sitting-around-a-table-with-drinks-K3AzpN5S6VU | Celebrate a tradition that is not your own by learning about it respectfully.
dap-321 | https://unsplash.com/photos/two-women-holding-shovels-2obBFGDL9xM | Volunteer your time for a cause.
dap-322 | https://unsplash.com/photos/three-men-wearing-yellow-volunteers-shirts-qKVSEuBT5EY | Organize a small act of kindness with friends.
dap-323 | https://unsplash.com/photos/man-in-white-t-shirt-and-white-pants-holding-black-and-white-box-BlnpElo7clE | Donate something meaningful.
dap-324 | https://unsplash.com/photos/two-people-clean-a-trash-strewn-beach-with-rakes-and-buckets--JM_GYT5PHc | Spend an afternoon helping someone.
dap-325 | https://unsplash.com/photos/volunteers-collecting-trash-on-a-beach-with-blue-bags-WwWPcQkzHPk | Clean up a public area.
dap-326 | https://unsplash.com/photos/women-talking-at-art-class-table-8NDGA3RepNg | Visit someone who may be lonely.
dap-327 | https://unsplash.com/photos/woman-wearing-red-and-black-checkered-blouse-using-flat-screen-computer-RMweULmCYxM | Help someone prepare for a job or interview.
dap-328 | https://unsplash.com/photos/two-men-by-lake-at-golden-hour-VCKNkF2vV94 | Mentor someone younger than you.
dap-329 | https://unsplash.com/photos/a-man-helping-another-man-stand-on-a-dock-vvIHNJkxd-Y | Support someone going through a difficult period.
dap-330 | https://unsplash.com/photos/group-of-people-sitting-on-front-firepit-x9I-6yoXrXE | Organize a small gathering that brings people together.
dap-331 | https://unsplash.com/photos/man-in-gray-crew-neck-t-shirt-wearing-black-framed-eyeglasses-using-computer-7K2i9iaBp80 |`;

function extractPhotoId(pageUrl) {
  const slug = pageUrl.match(/unsplash\.com\/photos\/([^/?#]+)/i)?.[1] || '';
  const m = slug.match(/-([A-Za-z0-9_-]{7,15})$/);
  return m ? m[1] : slug;
}

function buildImageUrl(rawOg) {
  if (!rawOg) return null;
  try {
    const u = new URL(rawOg);
    u.search = '';
    u.searchParams.set('auto', 'format');
    u.searchParams.set('fit', 'crop');
    u.searchParams.set('w', '900');
    u.searchParams.set('h', '1200');
    u.searchParams.set('q', '80');
    return u.toString();
  } catch {
    return rawOg;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveOgImage(pageUrl) {
  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'WorldChoirApp/1.0 (daily-act image assignment)',
      Accept: 'text/html',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const ogMatch =
    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
  let og = ogMatch?.[1] || null;
  if (!og) {
    const img = html.match(/https:\/\/(?:plus\.)?images\.unsplash\.com\/[A-Za-z0-9_=?&%./-]+/);
    og = img?.[0] || null;
  }
  return buildImageUrl(og);
}

async function main() {
  const rows = RAW.trim()
    .split('\n')
    .map((line) => {
      const parts = line.split('|').map((s) => s.trim());
      return { actId: parts[0], pageUrl: parts[1] || '', text: parts[2] || '' };
    })
    .filter((r) => r.actId && /^https?:\/\//i.test(r.pageUrl));

  for (const r of rows) r.photoId = extractPhotoId(r.pageUrl);

  const byPhoto = new Map();
  for (const r of rows) {
    if (!byPhoto.has(r.photoId)) byPhoto.set(r.photoId, []);
    byPhoto.get(r.photoId).push(r.actId);
  }
  const withinBatchDupes = [...byPhoto.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([photoId, actIds]) => ({ photoId, actIds }));

  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const existingByPhoto = new Map();
  for (const [id, row] of Object.entries(map.images || {})) {
    const pid = row.unsplashPhotoId || extractPhotoId(row.foreignLandingUrl || '');
    if (pid) existingByPhoto.set(pid, id);
  }

  // Keep first occurrence of each duplicated photo; skip later ones.
  const skipActs = new Set();
  const reportDupes = [];
  for (const d of withinBatchDupes) {
    const [keep, ...rest] = d.actIds;
    reportDupes.push({ photoId: d.photoId, keep, skipped: rest, reason: 'repeated in this batch' });
    for (const id of rest) skipActs.add(id);
  }

  // Also skip if photo already curated on a different act
  for (const r of rows) {
    if (skipActs.has(r.actId)) continue;
    const existing = existingByPhoto.get(r.photoId);
    if (existing && existing !== r.actId) {
      // If existing is also in this batch and not skipped, prefer earlier act (already in map curated or earlier in list)
      const earlierInBatch = rows.find((x) => x.actId === existing);
      if (earlierInBatch) {
        // keep existing assignment act, skip this one
        skipActs.add(r.actId);
        reportDupes.push({
          photoId: r.photoId,
          keep: existing,
          skipped: [r.actId],
          reason: 'same photo already used',
        });
      } else if (map.images[existing]?.curated) {
        skipActs.add(r.actId);
        reportDupes.push({
          photoId: r.photoId,
          keep: existing,
          skipped: [r.actId],
          reason: 'same photo already curated earlier',
        });
      }
    }
  }

  const toApply = rows.filter((r) => !skipActs.has(r.actId));
  console.log(`Parsed ${rows.length}; applying ${toApply.length}; skipping ${skipActs.size}`);
  if (reportDupes.length) {
    console.log('DUPLICATES:');
    for (const d of reportDupes) {
      console.log(`  ${d.photoId}: keep ${d.keep}, skip ${d.skipped.join(', ')} (${d.reason})`);
    }
  }

  const resolved = [];
  const failed = [];
  for (const r of toApply) {
    try {
      const imageUrl = await resolveOgImage(r.pageUrl);
      if (!imageUrl) throw new Error('no og:image');
      // quick validate
      const probe = await fetch(imageUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'WorldChoirApp/1.0', Range: 'bytes=0-1023' },
        redirect: 'follow',
      });
      if (!probe.ok && probe.status !== 206) throw new Error(`image HTTP ${probe.status}`);
      resolved.push({ ...r, imageUrl });
      console.log('OK', r.actId, r.photoId);
    } catch (err) {
      failed.push({ actId: r.actId, error: err.message });
      console.log('FAIL', r.actId, err.message);
    }
    await sleep(250);
  }

  const usedUrls = new Set(
    Object.entries(map.images)
      .filter(([id]) => !resolved.some((r) => r.actId === id))
      .map(([, row]) => row.imageUrl)
  );

  for (const r of resolved) {
    if (usedUrls.has(r.imageUrl)) {
      // Same CDN asset via different page? treat as conflict
      console.log('URL conflict for', r.actId, '— skipping');
      skipActs.add(r.actId);
      continue;
    }
    usedUrls.add(r.imageUrl);
    const prev = map.images[r.actId] || {};
    map.images[r.actId] = {
      imageUrl: r.imageUrl,
      imageBucket: prev.imageBucket || 'unsplash-curated',
      source: 'unsplash',
      author: '',
      title: '',
      query: 'owner-curated',
      foreignLandingUrl: r.pageUrl,
      unsplashPhotoId: r.photoId,
      curated: true,
    };
  }

  map.version = 7;
  map.source = 'Mixed: owner-curated Unsplash + Openverse/Wikimedia fallbacks';
  map.generatedAt = new Date().toISOString();
  map.count = Object.keys(map.images).length;
  map.uniqueUrls = new Set(Object.values(map.images).map((r) => r.imageUrl)).size;
  if (map.uniqueUrls !== map.count) {
    throw new Error(`Uniqueness failed: ${map.uniqueUrls}/${map.count}`);
  }
  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');

  // Update docs for applied + keep notes for skipped
  const fill = Object.fromEntries(resolved.filter((r) => !skipActs.has(r.actId)).map((r) => [r.actId, r.pageUrl]));
  // Also record skipped rows in docs with blank? Better leave them blank so user can replace.
  // Applied ones get filled.

  const txt = fs
    .readFileSync(TXT_PATH, 'utf8')
    .split('\n')
    .map((line) => {
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 3 || !/^dap-\d+$/.test(parts[0])) return line;
      const id = parts[0];
      if (!fill[id]) return line;
      parts[1] = fill[id];
      return parts.join(' | ');
    })
    .join('\n');
  fs.writeFileSync(TXT_PATH, txt);

  const csvLines = fs.readFileSync(CSV_PATH, 'utf8').split('\n');
  const outCsv = csvLines
    .map((line, i) => {
      if (i === 0 || !line.trim()) return line;
      const cols = [];
      let cur = '';
      let inQ = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"') {
          if (inQ && line[j + 1] === '"') {
            cur += '"';
            j++;
          } else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          cols.push(cur);
          cur = '';
        } else cur += ch;
      }
      cols.push(cur);
      while (cols.length < 6) cols.push('');
      const id = cols[0];
      if (fill[id]) cols[3] = fill[id];
      return cols.map((c) => (/[",\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',');
    })
    .join('\n');
  fs.writeFileSync(CSV_PATH, outCsv.endsWith('\n') ? outCsv : `${outCsv}\n`);

  const summary = {
    parsed: rows.length,
    applied: resolved.filter((r) => !skipActs.has(r.actId)).length,
    skippedDuplicates: [...skipActs],
    duplicates: reportDupes,
    failed,
  };
  fs.writeFileSync(path.join(ROOT, 'scripts/.last-unsplash-batch-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
