import React, { useState, useCallback, useRef } from 'react';
import { Upload, Sparkles, Download, RefreshCw, LayoutTemplate, Image as ImageIcon, Plus, Trash2, Type as TypeIcon, GripVertical, Settings2, AlignLeft, AlignCenter, AlignRight, AlignJustify, X, Bold } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import PosterPreview from './components/PosterPreview';
import { RichTextEditor } from './components/RichTextEditor';
import { PosterData, ImageConfig, ContentBlock, ContentBlockType, PosterDetail } from './types';

// Updated Default Data with HTML content for rich text compatibility
const INITIAL_DATA: PosterData = {
  subTitle: "请填写主标题",
  details: [
    { id: '1', label: '类别名称', value: "请填写内容" }
  ],
  marketingCopy: "请填写内容",
  content: [
    {
      id: 'default-text',
      type: 'text',
      // Converted to HTML-friendly format for the editor
      value: "请填写内容"
    }
  ]
};

function App() {
  const [posterData, setPosterData] = useState<PosterData>(INITIAL_DATA);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Drag and Drop State for Sidebar
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);
  // Only enable drag when hovering the handle to prevent conflict with inputs/sliders
  const [activeDragId, setActiveDragId] = useState<string | null>(null); 
  
  // Image State
  const [imageConfig, setImageConfig] = useState<ImageConfig>({
    url: "", // Default to empty/gray
    x: 0,
    y: 0,
    scale: 1
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageConfig({
        url,
        x: 0,
        y: 0,
        scale: 1
      });
    }
  };

  const handleDataChange = (field: keyof PosterData, value: any) => {
    setPosterData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Detail List Handlers
  const handleDetailChange = (id: string, field: 'label' | 'value', newValue: string) => {
    setPosterData(prev => ({
      ...prev,
      details: prev.details.map(d => d.id === id ? { ...d, [field]: newValue } : d)
    }));
  };

  const handleDetailStyleChange = (id: string, styleUpdate: Partial<NonNullable<PosterDetail['style']>>) => {
    setPosterData(prev => ({
      ...prev,
      details: prev.details.map(d => 
        d.id === id ? { ...d, style: { ...d.style, ...styleUpdate } } : d
      )
    }));
  };

  const handleAddDetail = () => {
    setPosterData(prev => ({
      ...prev,
      details: [...prev.details, { id: Date.now().toString(), label: '新项目', value: '' }]
    }));
  };

  const handleRemoveDetail = (id: string) => {
    setPosterData(prev => ({
      ...prev,
      details: prev.details.filter(d => d.id !== id)
    }));
  };

  // Block Content Handlers
  const handleAddBlock = (type: ContentBlockType) => {
    const newBlock: ContentBlock = {
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      type,
      value: type === 'text' ? '点击输入内容...' : ''
    };
    setPosterData(prev => ({
      ...prev,
      content: [...prev.content, newBlock]
    }));
  };

  const handleRemoveBlock = (id: string) => {
    setPosterData(prev => ({
      ...prev,
      content: prev.content.filter(b => b.id !== id)
    }));
  };

  const handleBlockChange = (id: string, value: string) => {
    setPosterData(prev => ({
      ...prev,
      content: prev.content.map(b => b.id === id ? { ...b, value } : b)
    }));
  };

  const handleBlockStyleChange = (id: string, styleUpdate: Partial<NonNullable<ContentBlock['style']>>) => {
    setPosterData(prev => ({
      ...prev,
      content: prev.content.map(b => 
        b.id === id ? { ...b, style: { ...b.style, ...styleUpdate } } : b
      )
    }));
  };

  const handleBlockImageUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      handleBlockChange(id, url);
    }
  };

  // DnD Handlers
  const handleDragStart = (index: number) => {
    setDraggedBlockIndex(index);
  };

  const handleDragEnter = (targetIndex: number) => {
    if (draggedBlockIndex === null || draggedBlockIndex === targetIndex) return;

    // Reorder the list directly
    setPosterData(prev => {
      const newContent = [...prev.content];
      const [draggedItem] = newContent.splice(draggedBlockIndex, 1);
      newContent.splice(targetIndex, 0, draggedItem);
      return {
        ...prev,
        content: newContent
      };
    });
    
    // Update index to follow the item
    setDraggedBlockIndex(targetIndex);
  };

  const handleDragEnd = () => {
    setDraggedBlockIndex(null);
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    
    const node = document.getElementById('poster-canvas');
    if (node) {
      setIsDownloading(true);
      try {
        // Double pass to ensure fonts and images are fully loaded/rendered
        // Sometimes a first empty pass or delay helps with webfont loading in canvas
        await new Promise(resolve => setTimeout(resolve, 100));

        const dataUrl = await htmlToImage.toPng(node, { 
          quality: 1.0, 
          pixelRatio: 3, // Higher resolution
          // cacheBust: true, // Removed as it breaks Blob URLs
          skipAutoScale: true,
          backgroundColor: '#efe8e0', // Match background to prevent transparent artifacts
          useCORS: true, // Critical for external images
          filter: (domNode) => {
            // Exclude elements that shouldn't be in the final export (like UI helpers)
            if (domNode instanceof HTMLElement && domNode.classList.contains('no-export')) {
              return false;
            }
            return true;
          }
        });
        
        const link = document.createElement('a');
        link.download = `poster-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      } catch (error) {
        console.error('Download failed:', error);
        const msg = error instanceof Error ? error.message : String(error);
        alert(`导出图片失败 (${msg})。建议使用系统截图功能作为备选方案。`);
      } finally {
        setIsDownloading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white text-[rgb(29,29,31)] font-sans flex flex-row">
      
      {/* LEFT SIDEBAR: Controls - Fixed Desktop Layout */}
      <div className="w-1/2 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 z-10">
        
        {/* Header */}
        <div className="px-[55px] pt-[55px] pb-6 border-b border-slate-100 shrink-0">
          <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-700">
            <LayoutTemplate className="w-6 h-6" />
            这相有礼商品详情页生成器
          </h1>
          {/* Subtitle removed as requested */}
        </div>

        {/* Content Section - Scrollable */}
        <div className="px-[55px] py-8 space-y-8 flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
          
          {/* STEP 1: Image */}
          <section className="space-y-4">
             <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[rgb(29,29,31)] uppercase tracking-wider">1. 头图设置</h2>
            </div>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="group border-2 border-dashed border-slate-300 rounded-lg p-4 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors flex flex-col items-center justify-center text-center h-24"
            >
              <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 mb-2" />
              <span className="text-xs text-slate-500 group-hover:text-indigo-600">点击上传图片</span>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleImageUpload}
              />
            </div>
            <p className="text-[10px] text-slate-400">
              * 上传后可在右侧预览图中拖拽调整位置（Smart Crop 人工微调）
            </p>
          </section>

          <hr className="border-slate-100" />

          {/* STEP 2: Manual Edits */}
          <section className="space-y-4">
             <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[rgb(29,29,31)] uppercase tracking-wider">2. 商品详情</h2>
            </div>

            <div className="space-y-8">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">描述文字</label>
                <textarea 
                  rows={2}
                  value={posterData.subTitle}
                  onChange={(e) => handleDataChange('subTitle', e.target.value)}
                  className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded focus:border-indigo-500 focus:outline-none resize-none overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
                  placeholder="输入标题，支持换行..."
                />
              </div>

              {/* Dynamic Details List */}
              <div className="space-y-2">
                 <div className="flex items-center justify-between">
                   <label className="block text-xs font-medium text-slate-500">商品类别</label>
                 </div>
                 
                 <div className="space-y-2">
                   {posterData.details.map((detail) => (
                     <div key={detail.id} className="flex gap-2 items-start group">
                       <input 
                         type="text"
                         value={detail.label}
                         onChange={(e) => handleDetailChange(detail.id, 'label', e.target.value)}
                         placeholder="标签"
                         className="w-20 p-2 text-xs bg-slate-50 border border-slate-200 rounded focus:border-indigo-500 focus:outline-none shrink-0"
                       />
                       
                       {/* Rich Text Editor for Detail Value */}
                       <div className="flex-1 flex flex-col gap-2">
                         <RichTextEditor 
                            value={detail.value}
                            onChange={(val) => handleDetailChange(detail.id, 'value', val)}
                            minHeight="80px"
                            className="w-full"
                         />
                         
                         {/* Alignment Controls for Detail */}
                         <div className="flex items-center gap-1">
                            <button 
                              className={`p-1 rounded hover:bg-slate-200 ${detail.style?.textAlign === 'left' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}
                              onClick={() => handleDetailStyleChange(detail.id, { textAlign: 'left' })}
                              title="左对齐"
                            >
                              <AlignLeft className="w-3 h-3" />
                            </button>
                            <button 
                              className={`p-1 rounded hover:bg-slate-200 ${detail.style?.textAlign === 'center' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}
                              onClick={() => handleDetailStyleChange(detail.id, { textAlign: 'center' })}
                              title="居中对齐"
                            >
                              <AlignCenter className="w-3 h-3" />
                            </button>
                            <button 
                              className={`p-1 rounded hover:bg-slate-200 ${detail.style?.textAlign === 'right' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}
                              onClick={() => handleDetailStyleChange(detail.id, { textAlign: 'right' })}
                              title="右对齐"
                            >
                              <AlignRight className="w-3 h-3" />
                            </button>
                            <button 
                              className={`p-1 rounded hover:bg-slate-200 ${(!detail.style?.textAlign || detail.style?.textAlign === 'justify') ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}
                              onClick={() => handleDetailStyleChange(detail.id, { textAlign: 'justify' })}
                              title="两端对齐"
                            >
                              <AlignJustify className="w-3 h-3" />
                            </button>
                         </div>
                       </div>

                       <button 
                         onClick={() => handleRemoveDetail(detail.id)}
                         className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                       >
                         <X size={14} />
                       </button>
                     </div>
                   ))}
                 </div>
                 
                 <button 
                    onClick={handleAddDetail}
                    className="w-full py-2 border border-dashed border-slate-300 text-slate-500 rounded hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-medium flex items-center justify-center gap-1 transition-all"
                 >
                   <Plus className="w-3 h-3" /> 添加行
                 </button>
              </div>
              
              {/* Marketing Copy / Rich Content Editor */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-2">详情内容</label>
                
                <div className="space-y-3">
                  {posterData.content.map((block, index) => (
                    <div 
                      key={block.id} 
                      className={`relative group transition-all flex gap-2 items-start py-2 ${
                        draggedBlockIndex === index ? 'opacity-50' : ''
                      }`}
                      // Critical Fix: Only make draggable if dragging is active (initiated from handle) or checking the active ID
                      draggable={activeDragId === block.id || draggedBlockIndex === index}
                      onDragStart={() => handleDragStart(index)}
                      onDragEnter={() => handleDragEnter(index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()} // Necessary to allow dropping
                    >
                      {/* Drag Handle */}
                      <div 
                        className="flex flex-col cursor-move text-slate-300 hover:text-indigo-400 mt-3"
                        onMouseEnter={() => setActiveDragId(block.id)}
                        onMouseLeave={() => setActiveDragId(null)}
                      >
                         <GripVertical className="w-4 h-4" />
                      </div>

                      <div className="flex-1">
                        {block.type === 'text' ? (
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex gap-2 items-start">
                              <TypeIcon className="w-4 h-4 text-slate-300 shrink-0 mt-3" />
                              
                              {/* Replaced Textarea with RichTextEditor */}
                              <RichTextEditor 
                                value={block.value}
                                onChange={(val) => handleBlockChange(block.id, val)}
                                className="w-full"
                                minHeight="100px"
                              />
                            </div>
                            
                            {/* Alignment Controls (Block Level) */}
                            <div className="flex items-center gap-1 pl-6">
                                <button 
                                  className={`p-1 rounded hover:bg-slate-200 ${block.style?.textAlign === 'left' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}
                                  onClick={() => handleBlockStyleChange(block.id, { textAlign: 'left' })}
                                  title="左对齐"
                                >
                                  <AlignLeft className="w-3 h-3" />
                                </button>
                                <button 
                                  className={`p-1 rounded hover:bg-slate-200 ${block.style?.textAlign === 'center' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}
                                  onClick={() => handleBlockStyleChange(block.id, { textAlign: 'center' })}
                                  title="居中对齐"
                                >
                                  <AlignCenter className="w-3 h-3" />
                                </button>
                                <button 
                                  className={`p-1 rounded hover:bg-slate-200 ${block.style?.textAlign === 'right' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}
                                  onClick={() => handleBlockStyleChange(block.id, { textAlign: 'right' })}
                                  title="右对齐"
                                >
                                  <AlignRight className="w-3 h-3" />
                                </button>
                                <button 
                                  className={`p-1 rounded hover:bg-slate-200 ${(!block.style?.textAlign || block.style?.textAlign === 'justify') ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}
                                  onClick={() => handleBlockStyleChange(block.id, { textAlign: 'justify' })}
                                  title="两端对齐"
                                >
                                  <AlignJustify className="w-3 h-3" />
                                </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2 items-center">
                              <ImageIcon className="w-4 h-4 text-slate-300 shrink-0" />
                              <div className="flex-1">
                                {block.value ? (
                                  <div className="relative w-full h-32 bg-slate-100 rounded overflow-hidden group/img border border-slate-200">
                                    <img 
                                      src={block.value} 
                                      className="w-full h-full object-cover" 
                                      alt="Block preview" 
                                      style={{
                                        objectPosition: block.style?.objectPosition || 'center'
                                      }}
                                    />
                                    <div className="absolute inset-0 bg-black/50 hidden group-hover/img:flex items-center justify-center">
                                        <label className="cursor-pointer text-white text-xs px-2 py-1 border border-white/50 rounded hover:bg-white/20">
                                          更换图片
                                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleBlockImageUpload(block.id, e)} />
                                        </label>
                                    </div>
                                  </div>
                                ) : (
                                  <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-slate-200 rounded cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all bg-slate-50">
                                    <span className="text-xs text-slate-400">点击上传插图</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleBlockImageUpload(block.id, e)} />
                                  </label>
                                )}
                              </div>
                            </div>
                            
                            {/* Image Controls: Height & Alignment */}
                            {block.value && (
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-100 mt-1 ml-6">
                                <span className="shrink-0 flex items-center gap-1"><Settings2 size={10}/> 高度:</span>
                                <input 
                                  type="range" 
                                  min="0" 
                                  max="600" 
                                  step="10"
                                  value={block.style?.height || 0}
                                  onChange={(e) => handleBlockStyleChange(block.id, { height: Number(e.target.value) })}
                                  onMouseDown={(e) => e.stopPropagation()} // Prevent focus loss
                                  className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                                <div className="flex items-center gap-0.5 ml-1">
                                  <input 
                                    type="number"
                                    min="0"
                                    value={block.style?.height || ''}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      handleBlockStyleChange(block.id, { height: val });
                                    }}
                                    placeholder="自适应"
                                    className="w-10 text-right bg-transparent border-b border-slate-300 focus:border-indigo-500 focus:outline-none p-0 text-[10px] font-mono appearance-none"
                                  />
                                  <span className="text-[10px] text-slate-400 select-none">px</span>
                                </div>
                                
                                <div className="w-px h-3 bg-slate-200 mx-1"></div>
                                
                                <span className="shrink-0">对齐:</span>
                                <select 
                                  value={block.style?.objectPosition || 'center'}
                                  onChange={(e) => handleBlockStyleChange(block.id, { objectPosition: e.target.value as any })}
                                  onMouseDown={(e) => e.stopPropagation()} 
                                  className="bg-transparent border-none p-0 text-[10px] focus:ring-0 cursor-pointer text-slate-700 font-medium"
                                >
                                  <option value="top">上</option>
                                  <option value="center">中</option>
                                  <option value="bottom">下</option>
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* New Delete Button moved here */}
                      <button 
                        onClick={() => handleRemoveBlock(block.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100 mt-1"
                        title="删除此块"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-3">
                  <button 
                    onClick={() => handleAddBlock('text')}
                    className="flex-1 py-2 border border-dashed border-slate-300 text-slate-500 rounded hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-medium flex items-center justify-center gap-1 transition-all"
                  >
                    <Plus className="w-3 h-3" /> 添加文本
                  </button>
                  <button 
                     onClick={() => handleAddBlock('image')}
                     className="flex-1 py-2 border border-dashed border-slate-300 text-slate-500 rounded hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-medium flex items-center justify-center gap-1 transition-all"
                  >
                    <Plus className="w-3 h-3" /> 添加图片
                  </button>
                </div>
              </div>

            </div>
          </section>

        </div>

        {/* Footer Actions */}
        <div className="px-[55px] pb-[21px] pt-6 bg-white border-t border-slate-200 shrink-0">
          <button 
            onClick={handleDownload}
            disabled={isDownloading}
            className={`w-full py-3 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 shadow-lg ${
              isDownloading ? 'bg-slate-400 cursor-wait' : 'bg-[rgb(29,29,31)] hover:bg-black'
            }`}
          >
            {isDownloading ? (
               <>
                 <RefreshCw className="w-4 h-4 animate-spin" />
                 生成中...
               </>
            ) : (
               <>
                 <Download className="w-4 h-4" />
                 导出
               </>
            )}
          </button>
        </div>
      </div>

      {/* RIGHT SIDE: Preview Canvas - Fixed Desktop Layout */}
      <div className="w-1/2 bg-slate-200 flex items-start justify-center p-[35px] overflow-hidden relative min-h-screen">
        <div className="absolute inset-0 pattern-grid-lg text-slate-300 opacity-20 pointer-events-none"></div>
        
        <div className="flex flex-col items-center">
          
          {/* The Poster Component - scalable for screen, but fixed pixels for export */}
          <div className="shadow-2xl ring-1 ring-black/5 rounded-sm overflow-hidden transform transition-transform duration-300 max-w-full">
            <PosterPreview 
              id="poster-canvas"
              data={posterData} 
              imageConfig={imageConfig}
              onImageConfigChange={setImageConfig}
            />
          </div>
        </div>
      </div>

    </div>
  );
}

export default App;