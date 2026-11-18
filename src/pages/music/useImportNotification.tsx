import type { ImportProgressItem } from "../../lib/musicService";
import { getNotificationApi } from "../../lib/notify";
import ImportProgress from "./ImportProgress";

const NOTIF_KEY = "playlist-import-progress";

// Lives in antd's <App> notification portal, fully independent of whatever
// panel triggered the import. So even if the user clicks away and the
// AddTrackPanel that started this unmounts, this keeps updating until done.
export function openImportNotification(label: string) {
  let items: ImportProgressItem[] = [];

  function render(done: number, total: number) {
    getNotificationApi().open({
      key: NOTIF_KEY,
      message: `Importing ${label}`,
      description: <ImportProgress done={done} total={total} items={items} />,
      placement: "bottomRight",
      duration: 0, // stays open until we close/replace it
      className: "import-notice",
    });
  }

  return {
    tick(done: number, total: number, item: ImportProgressItem) {
      items = [...items, item];
      render(done, total);
    },
    finish(finalMessage: string) {
      getNotificationApi().open({
        key: NOTIF_KEY,
        message: "Import finished",
        description: finalMessage,
        placement: "bottomRight",
        duration: 4,
        className: "import-notice",
      });
    },
  };
}