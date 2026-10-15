import { Page } from '../ui';
import { BackupPanel } from './settings/BackupPanel';
import { ItemMasterPanel } from './settings/ItemMasterPanel';
import { ParamsPanel } from './settings/ParamsPanel';

export function SettingsScreen() {
  return (
    <Page title="設定">
      <ItemMasterPanel />
      <ParamsPanel />
      <BackupPanel />
    </Page>
  );
}
