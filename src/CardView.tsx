import { Card, SUIT_SYMBOL, isRed, rankLabel } from '../shared/cards.ts';

interface Props {
  card: Card;
  playable?: boolean;
  dimmed?: boolean;
  selected?: boolean;
  /** Small label in the corner, e.g. "Joker". */
  badge?: string | null;
  size?: 'sm' | 'md';
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function CardView({ card, playable, dimmed, selected, badge, size, onClick, className = '', style }: Props) {
  const cls = [
    'card',
    isRed(card.suit) ? 'red' : 'black',
    playable && 'playable',
    dimmed && 'dimmed',
    selected && 'selected',
    size === 'sm' && 'sm',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const label = `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={cls}
      onClick={onClick}
      style={style}
      aria-label={badge ? `${label} (${badge})` : label}
      aria-pressed={onClick && selected !== undefined ? selected : undefined}
      disabled={onClick ? playable === false : undefined}
    >
      <span className="corner">
        {rankLabel(card.rank)}
        <br />
        {SUIT_SYMBOL[card.suit]}
      </span>
      <span className="pip">{SUIT_SYMBOL[card.suit]}</span>
      {badge && <span className="badge">{badge}</span>}
    </Tag>
  );
}

export function CardBack({ size, label }: { size?: 'sm' | 'md'; label?: string }) {
  return (
    <div className={`card back-card ${size === 'sm' ? 'sm' : ''}`} aria-label={label ?? 'Face-down card'}>
      {label && <span className="back-label">{label}</span>}
    </div>
  );
}

/** A compact row of small face-up cards (shown sets, revealed hands, thrown cards). */
export function MiniCards({
  cards,
  onClick,
  playable,
  badge,
}: {
  cards: Card[];
  onClick?: (c: Card) => void;
  playable?: boolean;
  badge?: (c: Card) => string | null;
}) {
  return (
    <div className="mini-cards">
      {cards.map((c, i) => (
        <CardView
          key={i}
          card={c}
          size="sm"
          badge={badge?.(c)}
          playable={onClick ? playable : undefined}
          onClick={onClick ? () => onClick(c) : undefined}
        />
      ))}
    </div>
  );
}
