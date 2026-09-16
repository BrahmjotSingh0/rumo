// Google Meet style: reactions float up from near the bottom of the screen
// and fade out, instead of a toast. Purely decorative - each entry removes
// itself (see MeetingPro's reaction-received handler) once its animation
// (index.css, .reaction-float) finishes.
const ReactionOverlay = ({ reactions }) => {
  if (reactions.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[95] overflow-hidden">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="reaction-float absolute text-4xl select-none"
          style={{ left: `${r.x}%`, bottom: '110px' }}
        >
          {r.emoji}
        </div>
      ))}
    </div>
  )
}

export default ReactionOverlay
