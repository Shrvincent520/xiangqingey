import React, { useRef, useState, useEffect } from 'react';
import { Move } from 'lucide-react';
import { PosterData, ImageConfig } from '../types';

interface PosterPreviewProps {
  id: string;
  data: PosterData;
  imageConfig: ImageConfig;
  onImageConfigChange: (config: ImageConfig) => void;
  scale?: number;
}

// Helper component for the "Pill" labels seen in reference image
// Updated to use the custom SVG shape as background
// Width reduced to w-[6.2rem] to achieve ~3px visual reduction from 6.4rem
// Updated: Supports HTML value for rich text rendering
const DetailRow: React.FC<{ label: string, value: string }> = ({ label, value }) => {
  // Heuristic: If text contains line breaks or is long (>24 chars), treat as long content
  // This triggers a vertical layout where the value sits below the label
  const isLong = value.length > 24 || value.includes('<br');

  return (
    <div className={`flex ${isLong ? 'flex-col items-start gap-2' : 'items-start gap-3'}`}>
      <div className="shrink-0 relative flex items-center justify-center w-[6.2rem] select-none">
        <svg viewBox="0 0 200 65" className="w-full h-auto text-[#C1A27F] fill-current drop-shadow-sm">
            <path d="m171.24,64.05H27.7c-7.32,0-13.73-4.41-15.81-10.79-7.03-1.87-11.89-7.76-11.89-14.51v-13.45c0-6.75,4.86-12.64,11.89-14.51C13.97,4.41,20.38,0,27.7,0h143.53c7.32,0,13.73,4.41,15.81,10.79,7.03,1.87,11.89,7.76,11.89,14.51v13.45c0,6.75-4.86,12.64-11.89,14.51-2.08,6.38-8.49,10.79-15.81,10.79ZM27.7,2c-6.64,0-12.42,4.07-14.06,9.9l-.16.57-.58.13c-6.42,1.49-10.91,6.71-10.91,12.7v13.45c0,5.99,4.49,11.22,10.91,12.7l.58.13.16.57c1.63,5.83,7.42,9.89,14.06,9.89h143.53c6.64,0,12.42-4.07,14.06-9.9l.16-.57.58-.13c6.42-1.49,10.91-6.71,10.91-12.7v-13.45c0-5.99-4.48-11.21-10.91-12.7l-.58-.13-.16-.57c-1.64-5.83-7.42-9.9-14.06-9.9H27.7Z" />
            <path d="m27.7,57.99c-4.83,0-9-2.85-10.14-6.93l-.81-2.89-2.92-.68c-4.57-1.06-7.76-4.65-7.76-8.74v-13.45c0-4.09,3.19-7.68,7.76-8.74l2.92-.68.81-2.89c1.14-4.08,5.31-6.93,10.14-6.93h143.53c4.83,0,9,2.85,10.14,6.93l.81,2.89,2.92.68c4.57,1.06,7.76,4.65,7.76,8.74v13.45c0,4.09-3.19,7.68-7.76,8.74l-2.92.68-.81,2.89c-1.15,4.08-5.32,6.93-10.14,6.93H27.7Z" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-white text-base font-normal tracking-wider pt-[1px]">
          {label}
        </span>
      </div>
      <div 
        className={`flex-1 text-[rgb(29,29,31)] text-base leading-relaxed font-medium ${isLong ? 'pt-0 pl-1' : 'pt-[3.5px]'}`}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    </div>
  );
};

const PosterPreview: React.FC<PosterPreviewProps> = ({ 
  id, 
  data, 
  imageConfig, 
  onImageConfigChange,
  scale = 1 
}) => {
  // Global Drag State
  const [dragState, setDragState] = useState<{
    type: 'header';
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);

  // Setup Global Drag Listeners (Only for header image)
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragState.startX) / scale; 
      const dy = (e.clientY - dragState.startY) / scale;

      if (dragState.type === 'header') {
        onImageConfigChange({
          ...imageConfig,
          x: dragState.initialX + dx,
          y: dragState.initialY + dy
        });
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, imageConfig, onImageConfigChange, scale]);

  // Setup Wheel Zoom Listener for Header Image
  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;

    // Only attach zoom listener if there is an image
    if (!imageConfig.url) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const delta = -e.deltaY;
      const sensitivity = 0.001; 
      const newScale = Math.max(0.1, Math.min(10, imageConfig.scale + delta * sensitivity));
      
      onImageConfigChange({
        ...imageConfig,
        scale: newScale
      });
    };

    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [imageConfig, onImageConfigChange]);


  // Handler Factories
  const startHeaderDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!imageConfig.url) return;
    setDragState({
      type: 'header',
      startX: e.clientX,
      startY: e.clientY,
      initialX: imageConfig.x,
      initialY: imageConfig.y
    });
  };

  const posterWidth = 375; 
  
  return (
    <div 
      id={id}
      className="bg-[#efe8e0] shadow-2xl overflow-hidden relative flex flex-col text-[rgb(29,29,31)]"
      style={{
        width: `${posterWidth}px`,
        minHeight: `${posterWidth * 1.77}px`, 
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {/* 1. Header Image Area (Interactive) */}
      <div 
        ref={headerRef}
        className={`relative w-full h-[320px] bg-slate-300 overflow-hidden shrink-0 ${imageConfig.url ? 'cursor-move group' : ''}`}
        onMouseDown={startHeaderDrag}
      >
        {imageConfig.url ? (
          <>
            <img 
              src={imageConfig.url} 
              alt="Header" 
              crossOrigin={imageConfig.url.startsWith('http') ? "anonymous" : undefined}
              className="absolute max-w-none origin-center pointer-events-none select-none"
              style={{
                transform: `translate(${imageConfig.x}px, ${imageConfig.y}px) scale(${imageConfig.scale})`,
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
            
            {/* Helper Overlay - Hidden during export via 'no-export' class */}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none no-export">
              <div className="bg-white/90 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 shadow-sm">
                <Move size={12} /> 拖拽调整 / 滚轮缩放
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full bg-slate-200"></div>
        )}
      </div>

      {/* 2. Main Content Container (Overlapping) */}
      <div className="flex-1 flex flex-col px-4 -mt-10 relative z-10 pb-8 space-y-4">
        
        {/* Title Card */}
        <div className="bg-[rgb(255,244,239)] rounded-[0.55rem] p-[1.8rem] shadow-sm text-left">
          <h2 className="text-xl font-bold text-[rgb(29,29,31)] leading-tight whitespace-pre-wrap">
            {data.subTitle || "主题 Slogan"}
          </h2>
        </div>

        {/* Details Card */}
        <div className="bg-[rgb(255,244,239)] rounded-[0.55rem] p-[1.8rem] shadow-sm">
          <h3 className="text-lg font-bold text-[rgb(29,29,31)] mb-5">活动详情</h3>
          
          <div className="space-y-4">
            {data.details?.map((item) => (
              <DetailRow 
                key={item.id} 
                label={item.label} 
                value={item.value} 
              />
            )) || <div className="text-sm text-slate-400">暂无信息</div>}
          </div>
        </div>

        {/* Marketing Narrative & Mixed Content - Standard Flow */}
        <div className="px-1 pt-2 space-y-4 relative">
          {data.content.map((block) => {
            // Determine text alignment class
            const alignmentClass = {
              left: 'text-left',
              center: 'text-center',
              right: 'text-right',
              justify: 'text-justify'
            }[block.style?.textAlign || 'justify'];
            
            return (
              <div 
                key={block.id}
                className="relative transition-all"
              >
                {block.type === 'text' && block.value && (
                  <div 
                    className={`text-base leading-7 select-none ${alignmentClass}`}
                    dangerouslySetInnerHTML={{ __html: block.value }}
                    style={{ wordBreak: 'break-word' }}
                  />
                )}
                {block.type === 'image' && block.value && (
                  <div 
                    className="w-full rounded-lg overflow-hidden shadow-sm pointer-events-none"
                    style={{ 
                      height: block.style?.height ? `${block.style.height}px` : 'auto' 
                    }}
                  >
                    <img 
                      src={block.value} 
                      alt="Detail" 
                      className="w-full h-full object-cover block"
                      style={{
                        height: block.style?.height ? '100%' : 'auto',
                        objectPosition: block.style?.objectPosition || 'center'
                      }}
                      crossOrigin={block.value.startsWith('http') ? "anonymous" : undefined}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default PosterPreview;