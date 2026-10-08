import { useFavorites } from '../context/FavoritesContext';
import { PageHeader } from '../components/Layout';
import { ButtonLink, EmptyState } from '../components/ui';
import { VenueCard, VenueCardSkeleton, VenueGrid } from '../components/VenueCard';

export default function Favorites() {
  const { items, loading } = useFavorites();

  return (
    <>
      <PageHeader
        eyebrow="Tài khoản"
        title={
          <>
            Sân yêu thích <span className="text-rose-400">♥</span>
          </>
        }
        description="Những sân bạn đã lưu — đặt lại chỉ với một chạm."
      />

      <section className="container-page py-8">
        {loading && !items.length ? (
          <VenueGrid>
            {Array.from({ length: 4 }, (_, i) => (
              <VenueCardSkeleton key={i} />
            ))}
          </VenueGrid>
        ) : !items.length ? (
          <EmptyState
            emoji="💚"
            title="Chưa có sân yêu thích"
            description="Bấm vào biểu tượng trái tim trên thẻ sân để lưu lại những nơi bạn muốn quay lại."
            action={<ButtonLink to="/venues">Khám phá sân</ButtonLink>}
          />
        ) : (
          <>
            <p className="mb-6 text-sm text-muted">
              Bạn đang lưu <strong className="text-base text-fg">{items.length}</strong> sân
            </p>
            <VenueGrid>
              {items.map((venue, index) => (
                <VenueCard key={venue._id} venue={{ ...venue, id: venue._id }} index={index} />
              ))}
            </VenueGrid>
          </>
        )}
      </section>
    </>
  );
}
