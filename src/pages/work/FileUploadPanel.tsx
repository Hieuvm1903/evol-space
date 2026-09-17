import React, { useRef, useState } from "react";
import { UploadCloud, Box, X } from "lucide-react";
import { detectFormat, type LoadedModel } from "./types";

interface Props {
  models: LoadedModel[];
  selectedId: string | null;
  onFilesAdded: (models: LoadedModel[]) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

export default function FileUploadPanel({ models, selectedId, onFilesAdded, onSelect, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const added: LoadedModel[] = [];
    const rejected: string[] = [];

    Array.from(fileList).forEach((file) => {
      const format = detectFormat(file.name);
      if (!format) { rejected.push(file.name); return; }
      added.push({
        id: crypto.randomUUID(),
        name: file.name,
        format,
        url: URL.createObjectURL(file),
      });
    });

    setError(rejected.length ? `Skipped unsupported file(s): ${rejected.join(", ")}` : null);
    if (added.length) onFilesAdded(added);
  }

  return (
    <div>
      <h3 className="work-section-title"><Box size={13} /> Load a mesh</h3>

      <label
        className={`work-dropzone${dragOver ? " dragover" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        <UploadCloud size={18} style={{ marginBottom: 6 }} />
        <div>Drop a file, or click to browse</div>
        <div className="work-hint" style={{ marginTop: 4 }}>.obj · .stl · .glb · .gltf</div>
        <input
          ref={inputRef}
          type="file"
          accept=".obj,.stl,.glb,.gltf"
          multiple
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
      </label>

      {error && <p className="work-error">{error}</p>}

      {models.length > 0 && (
        <div className="work-model-list">
          {models.map((m) => (
            <div
              key={m.id}
              className={`work-model-row${m.id === selectedId ? " active" : ""}`}
              onClick={() => onSelect(m.id)}
            >
              <span className="work-model-badge">{m.format}</span>
              <span className="work-model-name" title={m.name}>{m.name}</span>
              <button
                type="button"
                className="work-model-remove"
                onClick={(e) => { e.stopPropagation(); onRemove(m.id); }}
                title="Remove"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}