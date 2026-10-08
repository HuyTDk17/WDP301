import type { CancellationTier } from '../lib/api';
import { cn } from '../lib/format';

/** "Trước 24 giờ", "Từ 12 đến dưới 24 giờ", "Dưới 2 giờ"… */
const tierLabel = (tiers: CancellationTier[], index: number): string => {
  const { minLeadHours } = tiers[index];
  const upper = index > 0 ? tiers[index - 1].minLeadHours : null;
  if (upper === null) return `Trước giờ chơi từ ${minLeadHours} giờ trở lên`;
  if (minLeadHours === 0) return `Dưới ${upper} giờ trước giờ chơi`;
  return `Từ ${minLeadHours} đến dưới ${upper} giờ trước giờ chơi`;
};

/**
 * Bảng tỉ lệ hoàn tiền theo thời gian báo trước.
 * `activeRate` tô đậm mức đang áp dụng (dùng trong hộp thoại huỷ lịch).
 */
export default function CancellationPolicyTable({
  tiers,
  activeRate,
  className,
}: {
  tiers: CancellationTier[];
  activeRate?: number;
  className?: string;
}) {
  // Backend đã sắp xếp giảm dần theo minLeadHours.
  return (
    <ul className={cn('overflow-hidden rounded-2xl border border-line bg-surface text-sm', className)}>
      {tiers.map((tier, index) => {
        const active = activeRate !== undefined && tier.refundRate === activeRate;
        const percent = Math.round(tier.refundRate * 100);
        return (
          <li
            key={tier.minLeadHours}
            className={cn(
              'flex items-center justify-between gap-4 px-4 py-3',
              index > 0 && 'border-t border-line',
              active && 'bg-brand-500/10 font-bold'
            )}
          >
            <span className={cn(!active && 'text-muted')}>{tierLabel(tiers, index)}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold',
                percent === 100 && 'bg-brand-500/15 text-brand-700 dark:text-brand-300',
                percent > 0 && percent < 100 && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                percent === 0 && 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
              )}
            >
              {percent === 0 ? 'Không hoàn tiền' : `Hoàn ${percent}%`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
