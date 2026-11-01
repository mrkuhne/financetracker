import type { CSSProperties } from 'react';
import type { Category } from '@/data/categories';
import { Icon } from '@/features/shell/Icons';
import { categoryColor } from './txLogic';

type IconProps = Parameters<typeof Icon>[0];

export function CatIcon({ category, icon }: { category?: Category; icon?: IconProps['name'] }) {
  return (
    <span className="ci" style={{ '--c': categoryColor(category) } as CSSProperties}>
      <Icon name={icon ?? ((category?.icon ?? 'dots') as IconProps['name'])} />
    </span>
  );
}
