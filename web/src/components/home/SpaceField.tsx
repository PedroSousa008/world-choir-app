import './SpaceField.css';

export function SpaceField() {
  return (
    <div className="space-field" aria-hidden>
      <div className="space-field__gradient" />
      <div className="space-field__stars space-field__stars--far" />
      <div className="space-field__stars space-field__stars--mid" />
      <div className="space-field__stars space-field__stars--near" />
      <div className="space-field__particles" />
    </div>
  );
}
