import React, { useLayoutEffect, useRef } from 'react';
import { Bold, Palette } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  minHeight?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ 
  value, 
  onChange, 
  className = '', 
  placeholder,
  minHeight = '160px'
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);

  // 使用 useLayoutEffect 确保在 DOM 绘制前同步内容，避免闪烁
  useLayoutEffect(() => {
    if (editorRef.current) {
      const currentHTML = editorRef.current.innerHTML;
      
      // 核心逻辑：仅当内容确实改变且用户未聚焦时才更新 DOM
      // 如果用户正在输入（Focus状态），完全信任浏览器原生的 DOM 行为
      // 这样可以彻底解决光标跳动和无法连续删除的问题
      if (value !== currentHTML) {
        if (!isFocused.current) {
          editorRef.current.innerHTML = value;
        }
        // 如果是 Focus 状态，说明差异来自用户的输入过程，
        // 此时不要触碰 innerHTML，否则会导致光标重置
      }
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      // 只有内容确实变化时才通知父组件，避免不必要的循环
      if (html !== value) {
        onChange(html);
      }
    }
  };

  const execCmd = (cmd: string, arg?: string) => {
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, arg);
    handleInput(); // 命令执行后立即触发更新
    editorRef.current?.focus();
  };

  return (
    <div className={`border border-slate-200 rounded-lg overflow-hidden bg-slate-50 focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all flex flex-col ${className}`}>
      {/* 工具栏 */}
      <div className="flex items-center gap-1 p-1.5 border-b border-slate-200 bg-white select-none">
         <button 
           onClick={(e) => { e.preventDefault(); execCmd('bold'); }} 
           className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-indigo-600 transition-colors"
           title="加粗 (选中文字)"
           type="button"
         >
           <Bold className="w-4 h-4" />
         </button>
         
         <div className="h-4 w-px bg-slate-200 mx-1"></div>

         <div className="relative group p-1.5 rounded hover:bg-slate-100 cursor-pointer">
            <Palette className="w-4 h-4 text-slate-600 group-hover:text-indigo-600" />
            <input 
              type="color" 
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              onChange={(e) => execCmd('foreColor', e.target.value)}
              title="文字颜色 (选中文字)"
            />
         </div>
         <span className="text-[10px] text-slate-400 ml-2">选中文字以应用样式</span>
      </div>

      {/* 编辑区域 - 移除 dangerouslySetInnerHTML 以避免 React 冲突 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => { isFocused.current = false; }}
        className="flex-1 p-3 outline-none text-sm text-[rgb(29,29,31)] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
        style={{ whiteSpace: 'pre-wrap', minHeight }}
      />
    </div>
  );
};