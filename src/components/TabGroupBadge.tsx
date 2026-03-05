import { GROUP_COLORS } from '../utils/constants';

interface Props {
  color: string;
  title?: string;
}

export function TabGroupBadge({ color, title }: Props) {
  const bgColor = GROUP_COLORS[color] ?? GROUP_COLORS.grey;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
      style={{ backgroundColor: bgColor }}
    >
      {title || '\u00A0'}
    </span>
  );
}
