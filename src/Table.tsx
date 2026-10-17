import { CallbreakTable } from './CallbreakTable.tsx';
import type { TableProps } from './common.tsx';
import { DhumbalTable } from './DhumbalTable.tsx';
import { KittiTable } from './KittiTable.tsx';
import { MarriageTable } from './MarriageTable.tsx';

export function Table(props: TableProps) {
  switch (props.view.game!.type) {
    case 'callbreak':
      return <CallbreakTable {...props} />;
    case 'marriage':
      return <MarriageTable {...props} />;
    case 'dhumbal':
      return <DhumbalTable {...props} />;
    case 'kitti':
      return <KittiTable {...props} />;
  }
}
