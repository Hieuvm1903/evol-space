import { notification } from "antd";
import type { ImportProgressItem } from "../../lib/musicService";
import ImportProgress from "./ImportProgress";

const NOTIF_KEY = "playlist-import-progress";

// Lives in antd's notification portal (mounted at document.body), fully
// independent of whatever panel triggered the import. So even if the
// person clicks away and the AddTrackPanel that started this unmounts,
// this keeps updating until the import actually finishes.
export function openImportNotification(label: string) {
  let items: ImportProgressItem[] = [];

  function render(done: number, total: number) {
    notification.open({
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
      notification.open({
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