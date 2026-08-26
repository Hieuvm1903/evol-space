import React from "react";
import { SoundOutlined } from "@ant-design/icons";
import ElasticSlider from "../../../components/reactbits/ElasticSlider";

interface Props {
  volume: number;
  onChange: (v: number) => void;
}

export default function VolumeRow({ volume, onChange }: Props) {
  return (
    <div id="volume-row">
      <ElasticSlider
        value={volume}
        onChange={onChange}
        leftIcon={<SoundOutlined style={{ fontSize: 12 }} />}
        trackHeight={5}
      />
    </div>
  );
}