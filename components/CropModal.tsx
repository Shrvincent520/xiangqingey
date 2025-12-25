import React, { useState, useRef, useEffect } from 'react';
import { X, Check, ZoomIn, ZoomOut, Move } from 'lucide-react';
import { HeaderImage } from '../types';

interface CropModalProps {
  image: HeaderImage;
  onSave: (id: string, crop: { x: number; y: number; scale: number }) => void;
  onClose: () => void;
}

// Fixed preview size helps normalize calculations between UI and Export Canvas
export const PREVIEW_SIZE = 320;

const CropModal: React.FC<CropModalProps> = ({ image, onSave, onClose }) => {
  const [config, setConfig] = useState({
    x: image.crop?.x || 0,
    y: image.crop?.y || 0,
    scale: image.crop?.scale || 1,
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; initialX: number; initialY: number } | null>(null);

  // Mouse/Touch Handlers for Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: config.x,
      initialY: config.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;
      
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      setConfig(prev => ({
        ...prev,
        x: dragStartRef.current!.initialX + dx,
        y: dragStartRef.current!.initialY + dy
      }));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Wheel Handler for Zooming
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const delta = -e.deltaY;
    const sensitivity = 0.001;
    const newScale = Math.max(0.1, Math.min(5, config.scale + delta * sensitivity));
    
    setConfig(prev => ({ ...prev, scale: newScale }));
  };

  const handleSave = () => {
    onSave(image.id, config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl overflow-hidden shadow-2xl max-w-lg w-full flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Move className="w-4 h-4 text-indigo-600" />
            调整图片位置
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Viewport */}
        <div className="p-8 bg-slate-100 flex flex-col items-center justify-center gap-4">
          <div 
            className="relative bg-slate-300 shadow-inner overflow-hidden cursor-move group ring-4 ring-white"
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
          >
            {/* Grid Helper */}
            <div className="absolute inset-0 z-10 pointer-events-none border border-white/20 grid grid-cols-3 grid-rows-3 opacity-50">
                <div className="border-r border-white/20"></div>
                <div className="border-r border-white/20"></div>
                <div></div>
                <div className="col-span-3 border-t border-white/20 h-px"></div>
                <div className="col-span-3 border-t border-white/20 h-px row-start-3"></div>
            </div>
            
            <img 
              src={image.url} 
              alt="Crop Preview"
              // Removed 'object-cover' and 'h-full'. Use 'w-full' to fit width initially.
              // 'origin-center' is kept for scaling consistency
              className="absolute max-w-none origin-center pointer-events-none select-none w-full"
              style={{
                height: 'auto', 
                transform: `translate(${config.x}px, ${config.y}px) scale(${config.scale})`
              }}
            />
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
                <span className="bg-black/60 text-white text-[10px] px-2 py-1 rounded-full">拖拽平移 / 滚轮缩放</span>
            </div>
          </div>

          {/* Scale Slider Control */}
          <div className="w-full max-w-[320px] flex items-center gap-3">
             <ZoomOut size={16} className="text-slate-400" />
             <input 
               type="range" 
               min="0.1" 
               max="5" 
               step="0.01" 
               value={config.scale}
               onChange={(e) => setConfig(prev => ({ ...prev, scale: parseFloat(e.target.value) }))}
               className="flex-1 accent-indigo-600 h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer"
             />
             <ZoomIn size={16} className="text-slate-400" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-3 bg-white">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
          >
            取消
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors font-medium flex items-center gap-2"
          >
            <Check size={16} />
            确认裁剪
          </button>
        </div>
      </div>
    </div>
  );
};

export default CropModal;