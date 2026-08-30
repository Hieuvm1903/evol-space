import React from "react";
import { Modal } from "antd";

interface Props {
  open: boolean;
  onClose: () => void;
  videoId: string;
  title?: string;
}

export default function VideoPreviewModal({ open, onClose, videoId, title }: Props) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
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