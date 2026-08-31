import React from "react";
import { Modal, Button } from "antd";
import { Plus, Check } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  videoId: string;
  title?: string;
  onAdd?: () => void;
  adding?: boolean;
  added?: boolean;
}

export default function VideoPreviewModal({ open, onClose, videoId, title, onAdd, adding, added }: Props) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={
        onAdd ? (
          <Button
            type="primary"
            className="btn-glow"
            icon={added ? <Check size={14} /> : <Plus size={14} />}
            loading={adding}
            disabled={added}
            onClick={onAdd}
          >
            {added ? "Added" : "Add to playlist"}
          </Button>
        ) : null
      }
      destroyOnClose
      centered
      width={640}
      title={title || "Preview"}
      className="video-preview-modal"
    >
      {open && (
        <div className="video-preview-embed-wrap">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            title={title || "Video preview"}
            frameBorder={0}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </Modal>
  );
}