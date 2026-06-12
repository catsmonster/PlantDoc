import { photoUrl } from '../lib/repo';
import type { Plant } from '../lib/types';

function getPlantTint(plantId: string): [string, string] {
  const tints: [string, string][] = [
    ['#3c7140', '#9cc49a'],
    ['#5a8f3c', '#cfe0a0'],
    ['#2f6f5e', '#a7d4c4'],
    ['#3f6b3a', '#b6c98a'],
    ['#2f5934', '#9cc49a'],
    ['#3c7140', '#c7b78f'],
  ];
  let hash = 0;
  for (let i = 0; i < plantId.length; i++) {
    hash = plantId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % tints.length;
  return tints[index];
}

interface PlantImageSlotProps {
  plant: Plant;
  height: number;
  radius: number;
  caption?: string;
  isDark?: boolean;
}

export function PlantImageSlot({ plant, height, radius, caption, isDark }: PlantImageSlotProps) {
  // Check if plant has any uploaded photos in observations
  const latestPhoto = plant.observations?.find(
    (obs) => obs.photos && obs.photos.length > 0
  )?.photos?.[0];

  const tint = getPlantTint(plant.$id);

  if (latestPhoto) {
    return (
      <img
        src={photoUrl(latestPhoto.private_file_id)}
        alt={plant.nickname}
        loading="lazy"
        style={{
          width: '100%',
          height: `${height}px`,
          borderRadius: `${radius}px`,
          objectFit: 'cover',
          display: 'block',
        }}
      />
    );
  }

  // Fallback gradient
  const bg = isDark
    ? `linear-gradient(160deg, ${tint[0]}, ${tint[1]}), radial-gradient(120% 80% at 75% 15%, rgba(255,255,255,.18), transparent 55%)`
    : `linear-gradient(150deg, ${tint[0]}22, ${tint[1]}3a 70%), radial-gradient(120% 90% at 78% 12%, ${tint[1]}33, transparent 60%)`;

  return (
    <div
      style={{
        width: '100%',
        height: `${height}px`,
        borderRadius: `${radius}px`,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isDark ? 'rgba(255, 255, 255, 0.62)' : 'rgba(35, 48, 42, 0.5)',
        fontSize: '12px',
        fontWeight: 500,
        textTransform: 'uppercase',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.09)' : '1px solid #E7E0D2',
        boxSizing: 'border-box',
      }}
    >
      {caption || ' '}
    </div>
  );
}
