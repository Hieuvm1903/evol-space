import React from "react";
import { Popover } from "antd";
import type { TooltipPlacement } from "antd/es/tooltip";

interface HelpTipProps {
  content: React.ReactNode;
  title?: React.ReactNode;
  placement?: TooltipPlacement;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export default function HelpTip({
  content,
  title,
  placement = "bottom",
  label = "Show instructions",
  size = "sm",
  className,
}: HelpTipProps) {
  return (
    <Popover
      content={<div className="help-tip-content">{content}</div>}
      title={title}
      trigger={["hover", "click"]}
      placement={placement}
      zIndex={1350}
      overlayClassName="help-tip-popover"
      overlayStyle={{ maxWidth: 320 }}
    >
      <button
        type="button"
        className={`help-tip-btn help-tip-btn-${size}${className ? ` ${className}` : ""}`}
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        ?
      </button>
    </Popover>
  );
}
