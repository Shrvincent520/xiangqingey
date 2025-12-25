import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Sparkles, Download, RefreshCw, LayoutTemplate, Image as ImageIcon, Plus, Trash2, Type as TypeIcon, GripVertical, Settings2, AlignLeft, AlignCenter, AlignRight, AlignJustify, X, Bold, Save, History, Clock, AlertCircle, Layers, FolderDown, Pencil, FileJson, FolderOpen, HardDriveDownload, Loader2, Copy } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import JSZip from 'jszip';
import PosterPreview from './components/PosterPreview';
import CropModal, { PREVIEW_SIZE } from './components/CropModal';
import { RichTextEditor } from './components/RichTextEditor';
import { PosterData, ImageConfig, ContentBlock, ContentBlockType, PosterDetail, HeaderImage } from './types';

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

// Interface for Saved Records
interface SavedRecord {
  id: string;
  name: string;
  timestamp: number;
  data: PosterData;
  imageConfig: ImageConfig;
  functionalImages?: HeaderImage[];
}

// --- IndexedDB Utilities (Replaces localStorage) ---
const DB_NAME = 'PosterGeneratorDB';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;

const dbAPI = {
  open: (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  },
  
  add: async (record: SavedRecord): Promise<void> => {
    const db = await dbAPI.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record); // put allows updating if id exists
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  getAll: async (): Promise<SavedRecord[]> => {
    const db = await dbAPI.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        // Sort by timestamp descending (newest first)
        const records = request.result as SavedRecord[];
        records.sort((a, b) => b.timestamp - a.timestamp);
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  },

  delete: async (id: string): Promise<void> => {
    const db = await dbAPI.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};

// Helper: Convert Blob URL to Base64 for storage
const blobUrlToBase64 = async (url: string): Promise<string> => {
  if (!url || url.startsWith('data:')) return url; // Already base64 or empty
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Image conversion failed", e);
    return "";
  }
};

// Helper: Resize and Compress Image on Upload
const processImageFile = (file: File, maxWidth: number = 960): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Resize logic: Only downscale if larger than maxWidth
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          // Fallback to original if canvas fails
          resolve(URL.createObjectURL(file));
          return;
        }

        // Fill white background for JPEGs (handles transparent PNGs converting to JPEG black background issue)
        // Note: If preserving PNG transparency is critical, we might need logic here, 
        // but for product details, white bg is usually safer for JPEGs.
        if (file.type !== 'image/png') {
           ctx.fillStyle = '#FFFFFF';
           ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Compress
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const quality = 0.7; // Reduced quality for better performance

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            resolve(URL.createObjectURL(file));
          }
        }, mimeType, quality);
      };
      img.onerror = () => resolve(URL.createObjectURL(file)); // Fallback
      img.src = readerEvent.target?.result as string;
    };
    reader.onerror = () => resolve(URL.createObjectURL(file)); // Fallback
    reader.readAsDataURL(file);
  });
};


// Helper to generate formatted timestamp string (YYYYMMDD-HHMMSS)
const getFormattedTimeStr = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
};

function App() {
  const [posterData, setPosterData] = useState<PosterData>(INITIAL_DATA);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isProcessingImg, setIsProcessingImg] = useState(false); // New state for image processing
  
  // Drag and Drop State for Sidebar
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);
  // Only enable drag when hovering the handle to prevent conflict with inputs/sliders
  const [activeDragId, setActiveDragId] = useState<string | null>(null); 
  
  // Existing Header Image State
  const [imageConfig, setImageConfig] = useState<ImageConfig>({
    url: "", // Default to empty/gray
    x: 0,
    y: 0,
    scale: 1
  });

  // NEW: Functional Images State (Multi-image)
  const [functionalImages, setFunctionalImages] = useState<HeaderImage[]>([]);
  const [draggedFuncImgIndex, setDraggedFuncImgIndex] = useState<number | null>(null);
  // State for Crop Modal
  const [editingFuncImageId, setEditingFuncImageId] = useState<string | null>(null);

  // History State
  const [showHistory, setShowHistory] = useState(false);
  const [savedRecords, setSavedRecords] = useState<SavedRecord[]>([]);
  
  // NEW: Track current draft ID to support Overwrite
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  
  // Save Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveAsCopy, setSaveAsCopy] = useState(false); // New option in modal

  const fileInputRef = useRef<HTMLInputElement>(null);
  const funcImgInputRef = useRef<HTMLInputElement>(null);
  // Ref for Project File Import
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  // Load history from IndexedDB on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const records = await dbAPI.getAll();
        setSavedRecords(records);
      } catch (e) {
        console.error("Failed to load history from IndexedDB", e);
      }
    };
    loadData();
  }, []);

  // Open Save Modal
  const handleOpenSaveModal = () => {
    // If it's a new draft (no ID), generate a name.
    // If it's an existing draft, keep the current name (allowing user to rename if they want).
    if (!currentDraftId) {
      setSaveName(`草稿 ${new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })}`);
    }
    // Reset "Save as Copy" check
    setSaveAsCopy(false);
    setIsSaveModalOpen(true);
  };

  // --- SAVE TO LOCAL FILE (EXPORT JSON) ---
  const handleSaveToLocalFile = async () => {
    setIsSaving(true);
    try {
      // 1. Prepare Data (Convert all images to Base64)
      const headerBase64 = await blobUrlToBase64(imageConfig.url || "");
      const savedFunctionalImages = await Promise.all(functionalImages.map(async (img) => {
         const base64 = await blobUrlToBase64(img.url);
         return { ...img, url: base64 };
      }));
      const newContent = await Promise.all(posterData.content.map(async (block) => {
        if (block.type === 'image' && block.value) {
          const base64 = await blobUrlToBase64(block.value);
          return { ...block, value: base64 };
        }
        return block;
      }));

      const exportData: SavedRecord = {
        id: Date.now().toString(),
        name: "Local Export",
        timestamp: Date.now(),
        data: { ...posterData, content: newContent },
        imageConfig: { ...imageConfig, url: headerBase64 },
        functionalImages: savedFunctionalImages
      };

      // 2. Create Blob and Download
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `详情页工程-${getFormattedTimeStr()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (e) {
      console.error("Export failed", e);
      alert("导出工程文件失败，请重试。");
    } finally {
      setIsSaving(false);
    }
  };

  // --- LOAD FROM LOCAL FILE (IMPORT JSON) ---
  const handleImportClick = () => {
    if (isImporting) return;
    projectFileInputRef.current?.click();
  };

  const handleFileImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("确定要导入该工程文件吗？当前未保存的修改将被覆盖。")) {
       e.target.value = '';
       return;
    }

    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const record = JSON.parse(json) as SavedRecord;
        
        // Basic validation
        if (!record.data || !record.imageConfig) {
          throw new Error("文件格式不正确：缺少必要的工程数据");
        }

        // Apply Data
        setPosterData(record.data);
        setImageConfig(record.imageConfig);
        setFunctionalImages(record.functionalImages || []);
        
        // Reset ID logic: Imported files are treated as new/unsaved drafts initially
        // to avoid ID conflicts with local DB.
        setCurrentDraftId(null); 
        setSaveName("");
        
        setTimeout(() => {
          alert(`✅ 导入成功！\n\n已加载工程，包含 ${record.functionalImages?.length || 0} 张商品主图。`);
        }, 100);

      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : "未知错误";
        alert(`❌ 导入失败：${msg}\n\n请确认您选择的是正确的 .json 工程文件。`);
      } finally {
        setIsImporting(false);
        if (projectFileInputRef.current) projectFileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      alert("❌ 读取文件出错，请重试。");
      setIsImporting(false);
      if (projectFileInputRef.current) projectFileInputRef.current.value = '';
    };

    setTimeout(() => {
        reader.readAsText(file);
    }, 50);
  };


  // Actual Save Logic (Updated to use IndexedDB)
  const executeSave = async () => {
    if (!saveName.trim()) return;

    setIsSaving(true);
    setIsSaveModalOpen(false); 
    
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // 1. Convert Existing Header Image
      const headerBase64 = await blobUrlToBase64(imageConfig.url || "");

      // 2. Convert New Functional Images
      const savedFunctionalImages = await Promise.all(functionalImages.map(async (img) => {
         const base64 = await blobUrlToBase64(img.url);
         return { ...img, url: base64 };
      }));
      
      // 3. Convert Content Images
      const newContent = await Promise.all(posterData.content.map(async (block) => {
        if (block.type === 'image' && block.value) {
          const base64 = await blobUrlToBase64(block.value);
          return { ...block, value: base64 };
        }
        return block;
      }));

      // Determine ID: Use existing if we have one and NOT saving as copy, otherwise generate new
      const idToSave = (!saveAsCopy && currentDraftId) ? currentDraftId : Date.now().toString();

      const record: SavedRecord = {
        id: idToSave,
        name: saveName,
        timestamp: Date.now(),
        data: { ...posterData, content: newContent },
        imageConfig: { ...imageConfig, url: headerBase64 },
        functionalImages: savedFunctionalImages
      };

      // Save to IndexedDB (Disk)
      await dbAPI.add(record);
      
      // Update State (Memory)
      setSavedRecords(prev => {
        // Remove old entry with same ID if exists (move to top logic)
        const filtered = prev.filter(r => r.id !== idToSave);
        return [record, ...filtered];
      });

      // Update current tracking ID
      setCurrentDraftId(idToSave);

    } catch (error) {
      alert("保存失败：数据库写入错误。可能是存储空间不足或权限受限。");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadRecord = (record: SavedRecord) => {
    if (window.confirm(`确定要重新编辑存档“${record.name}”吗？当前未保存的修改将丢失。`)) {
      setPosterData(record.data);
      setImageConfig(record.imageConfig);
      setFunctionalImages(record.functionalImages || []);
      
      // Track this record so subsequent saves overwrite it
      setCurrentDraftId(record.id);
      setSaveName(record.name);

      setShowHistory(false);
    }
  };

  const handleDeleteRecord = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("确定要删除这条记录吗？")) {
      try {
        await dbAPI.delete(id);
        setSavedRecords(prev => prev.filter(r => r.id !== id));
        // If deleting current draft, reset ID
        if (currentDraftId === id) {
          setCurrentDraftId(null);
          setSaveName("");
        }
      } catch (error) {
        console.error("Delete failed", error);
        alert("删除失败");
      }
    }
  };
  
  // Handler for Existing Header Image
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessingImg(true);
      try {
        const url = await processImageFile(file);
        setImageConfig({
          url,
          x: 0,
          y: 0,
          scale: 1
        });
      } catch (e) {
        console.error(e);
      } finally {
        setIsProcessingImg(false);
      }
    }
  };

  // Handlers for New Functional Images (Batch Processing)
  const handleFuncImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setIsProcessingImg(true);
    
    try {
      // Process images concurrently
      const processedImages = await Promise.all(files.map(async (file) => {
         const url = await processImageFile(file);
         return {
           id: Date.now().toString() + Math.random().toString().slice(2, 6),
           url: url,
         };
      }));

      setFunctionalImages(prev => [...prev, ...processedImages]);
    } catch (e) {
      console.error("Image processing failed", e);
    } finally {
      setIsProcessingImg(false);
      if (funcImgInputRef.current) funcImgInputRef.current.value = '';
    }
  };

  const handleRemoveFuncImg = (id: string) => {
    setFunctionalImages(prev => prev.filter(img => img.id !== id));
  };
  
  const handleSaveFuncCrop = (id: string, crop: { x: number; y: number; scale: number }) => {
    setFunctionalImages(prev => prev.map(img => 
      img.id === id ? { ...img, crop } : img
    ));
  };

  const handleFuncImgDragStart = (index: number) => {
    setDraggedFuncImgIndex(index);
  };

  const handleFuncImgDragEnter = (targetIndex: number) => {
    if (draggedFuncImgIndex === null || draggedFuncImgIndex === targetIndex) return;

    setFunctionalImages(prev => {
      const newImages = [...prev];
      const [draggedItem] = newImages.splice(draggedFuncImgIndex, 1);
      newImages.splice(targetIndex, 0, draggedItem);
      return newImages;
    });
    setDraggedFuncImgIndex(targetIndex);
  };

  const handleFuncImgDragEnd = () => {
    setDraggedFuncImgIndex(null);
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

  const handleBlockImageUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const url = await processImageFile(file);
        handleBlockChange(id, url);
      } catch (err) {
        console.error(err);
      }
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
    if (isDownloading || isZipping) return;
    
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
        // Updated filename format: 商品长图-YYYYMMDD-HHMMSS.png
        link.download = `商品长图-${getFormattedTimeStr()}.png`;
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

  // Modified: Export Functional Images as Zip with MANUAL CROP SUPPORT
  // Added 'silent' parameter to suppress alert when called from 'Export All' context
  const handleDownloadFunctional = async (silent: boolean = false) => {
    if (isDownloading || isZipping) return;
    
    if (functionalImages.length === 0) {
      if (!silent) {
        alert("没有可导出的商品主图。请先在“0. 商品主图”添加图片。");
      }
      return;
    }

    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("product-images");
      const OUTPUT_SIZE = 1000; // High resolution output square
      
      // Helper to process and crop image
      const processImage = (imgData: HeaderImage): Promise<Blob> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous'; 
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = OUTPUT_SIZE;
            canvas.height = OUTPUT_SIZE;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
               // 1. Fill background white
               ctx.fillStyle = '#FFFFFF';
               ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

               // 2. Calculate Base Dimensions (Fit Width / Original Basis)
               // Matches CSS in CropModal: width: 100%, height: auto
               const imgRatio = img.naturalWidth / img.naturalHeight;
               const drawW = OUTPUT_SIZE;
               const drawH = OUTPUT_SIZE / imgRatio;

               // 3. Apply User Transforms
               // The user transforms (x, y) were recorded on a PREVIEW_SIZE container.
               // We need to scale them up to the OUTPUT_SIZE.
               const ratio = OUTPUT_SIZE / PREVIEW_SIZE;
               const userX = (imgData.crop?.x || 0) * ratio;
               const userY = (imgData.crop?.y || 0) * ratio;
               const userScale = imgData.crop?.scale || 1;

               // 4. Perform Drawing
               ctx.save();
               
               // Transform Pivot Logic:
               // In CSS (CropModal), transform-origin is 'center' (50% 50%) of the ELEMENT.
               // The element is scaled to drawW x drawH.
               // So the pivot point is (drawW/2, drawH/2).
               const pivotX = drawW / 2;
               const pivotY = drawH / 2;
               
               // Move to pivot point
               ctx.translate(pivotX, pivotY);
               // Apply User Translation (relative to original position)
               ctx.translate(userX, userY);
               // Apply User Scale
               ctx.scale(userScale, userScale);
               // Move back from pivot point to draw relative to 0,0
               ctx.translate(-pivotX, -pivotY);

               // Draw the image at 0,0 (Fit Width basis)
               ctx.drawImage(img, 0, 0, drawW, drawH);
               
               ctx.restore();

               canvas.toBlob((blob) => {
                 if (blob) resolve(blob);
                 else reject(new Error('Canvas blob failed'));
               }, 'image/jpeg', 0.6);
            } else {
              reject(new Error('Canvas context failed'));
            }
          };
          img.onerror = (e) => reject(e);
          img.src = imgData.url;
        });
      };

      // Process images sequentially
      await Promise.all(functionalImages.map(async (img, index) => {
         try {
           const blob = await processImage(img);
           folder?.file(`image-${index + 1}.jpg`, blob);
         } catch (e) {
           console.error(`Failed to pack image ${index}`, e);
         }
      }));

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      // Updated filename format: 商品主图-YYYYMMDD-HHMMSS.zip
      link.download = `商品主图-${getFormattedTimeStr()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Zip creation failed", e);
      alert("导出商品主图压缩包失败，请重试。");
    } finally {
      setIsZipping(false);
    }
  };

  // Master Export Function
  const handleExportAll = async () => {
    if (isDownloading || isZipping || isSaving) return;

    // 1. Download Poster (Always)
    await handleDownload();

    // 2. Download Functional Images (If exist)
    if (functionalImages.length > 0) {
        // Small delay to ensure browser handles sequential downloads gracefully
        setTimeout(() => {
            handleDownloadFunctional(true); // Pass silent=true
        }, 500);
    }
  };

  // Find image to edit
  const editingFuncImage = functionalImages.find(img => img.id === editingFuncImageId);

  return (
    <div className="min-h-screen bg-white text-[rgb(29,29,31)] font-sans flex flex-row relative">
      {/* Hidden Input for Project Import */}
      <input 
        type="file" 
        ref={projectFileInputRef}
        onChange={handleFileImportChange}
        className="hidden" 
        accept=".json"
      />

      {/* Crop Modal */}
      {editingFuncImage && (
        <CropModal 
          image={editingFuncImage}
          onSave={handleSaveFuncCrop}
          onClose={() => setEditingFuncImageId(null)}
        />
      )}

      {/* Custom Save Modal - Text Updated */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
             <div className="p-5 border-b border-slate-100">
               <h3 className="font-bold text-lg flex items-center gap-2">
                 <Save className="w-5 h-5 text-indigo-600"/> 保存草稿 (历史记录)
               </h3>
             </div>
             <div className="p-6 space-y-4">
               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">给这个版本起个名字</label>
                 <input 
                    autoFocus
                    type="text" 
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="例如：双11活动第一版"
                    className="w-full px-3 py-2 bg-slate-100 border-transparent rounded-lg text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && executeSave()}
                 />
                 {currentDraftId && (
                   <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                     <Clock size={12} /> 正在编辑现有存档，保存将覆盖原记录
                   </p>
                 )}
               </div>

               {/* Overwrite or Copy Option */}
               <div className="flex items-center gap-2 p-3 bg-white rounded border border-slate-300">
                  <input 
                    type="checkbox" 
                    id="saveAsCopy"
                    checked={saveAsCopy}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSaveAsCopy(checked);
                      // Auto-append " 副本" when checking "Save as Copy" for an existing draft
                      if (checked && currentDraftId && saveName) {
                         setSaveName(saveName + " 副本");
                      } else if (!checked && currentDraftId && saveName.endsWith(" 副本")) {
                         // Optional: Remove suffix if unchecked
                         setSaveName(saveName.slice(0, -3));
                      }
                    }}
                    className="w-4 h-4 text-indigo-600 bg-white rounded focus:ring-indigo-500 border-gray-300"
                  />
                  <label htmlFor="saveAsCopy" className="text-sm text-slate-600 cursor-pointer flex items-center gap-1 select-none">
                    <Copy size={14} /> 另存为新副本 (不覆盖)
                  </label>
               </div>

               <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded border border-slate-100 flex gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5 text-indigo-500" />
                  <p>草稿将保存到浏览器的数据库中 (IndexedDB)，方便快速切换。</p>
               </div>
             </div>
             <div className="p-4 bg-slate-50 flex gap-3 justify-end border-t border-slate-100">
                <button 
                  onClick={() => setIsSaveModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={executeSave}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
                >
                  {saveAsCopy ? '另存为新记录' : (currentDraftId ? '覆盖保存' : '确认保存')}
                </button>
             </div>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR: Controls - Fixed Desktop Layout */}
      <div className="w-1/2 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 z-10">
        
        {/* Header - Added Project Buttons */}
        <div className="px-[55px] pt-[55px] pb-6 border-b border-slate-100 shrink-0 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-700">
            <LayoutTemplate className="w-6 h-6" />
            这相有礼商品详情页生成器
          </h1>
          
          {/* History & Project Controls */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleImportClick}
              disabled={isImporting}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md transition-colors ${
                isImporting ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
              }`}
              title="导入本地 .json 工程文件"
            >
              {isImporting ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />} 
              {isImporting ? '读取中...' : '导入工程'}
            </button>
            <button 
              onClick={handleSaveToLocalFile}
              disabled={isSaving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
              title="将当前工程保存为 .json 文件到电脑"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <HardDriveDownload size={14} />}
              导出工程
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-md transition-colors ${
                showHistory ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              title="查看浏览器缓存的历史记录"
            >
              <History size={14} /> 记录
            </button>
          </div>
        </div>

        {/* History Panel Overlay - Text Updated */}
        {showHistory && (
          <div className="absolute top-[100px] right-0 left-0 bottom-0 bg-white/95 backdrop-blur-sm z-50 px-[55px] py-8 border-b border-slate-200 flex flex-col shadow-xl animate-in slide-in-from-top-4 duration-200">
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-lg font-bold flex items-center gap-2">
                 <Clock className="w-5 h-5 text-indigo-500"/> 历史存档 (IndexedDB)
               </h3>
               <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-100 rounded-full">
                 <X size={20} className="text-slate-500" />
               </button>
             </div>
             
             <div className="flex-1 overflow-y-auto space-y-3 pr-2">
               {savedRecords.length === 0 ? (
                 <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-lg">暂无保存记录</div>
               ) : (
                 savedRecords.map(record => (
                   <div key={record.id} className={`flex items-center justify-between p-4 border rounded-lg transition-colors group ${currentDraftId === record.id ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200 hover:border-indigo-300'}`}>
                      <div className="flex flex-col cursor-pointer flex-1" onClick={() => handleLoadRecord(record)}>
                        <span className={`font-medium group-hover:text-indigo-700 ${currentDraftId === record.id ? 'text-indigo-800' : 'text-slate-800'}`}>
                           {record.name}
                           {currentDraftId === record.id && <span className="ml-2 text-[10px] bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full">当前编辑</span>}
                        </span>
                        <span className="text-xs text-slate-400">{new Date(record.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => handleLoadRecord(record)}
                          className="px-3 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
                        >
                          重新编辑
                        </button>
                        <button 
                          onClick={(e) => handleDeleteRecord(record.id, e)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="删除记录"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                   </div>
                 ))
               )}
             </div>
             <div className="mt-4 pt-4 border-t border-slate-100 text-[10px] text-slate-400 text-center">
               * 记录保存在您浏览器的 IndexedDB 数据库中，容量通常可达 GB 级别，清除浏览器数据会丢失记录。
             </div>
          </div>
        )}

        {/* Content Section - Scrollable */}
        <div className="px-[55px] py-8 space-y-8 flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
          
          {/* NEW SECTION 0: Functional Images (Multi-image, 1:1, Drag-sort, Delete) */}
          <section className="space-y-4">
             <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[rgb(29,29,31)] uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600"/>
                0. 商品主图
              </h2>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{functionalImages.length} 张</span>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              {functionalImages.map((img, index) => (
                <div 
                  key={img.id}
                  className={`relative aspect-square rounded-lg overflow-hidden border border-slate-200 group cursor-move ${draggedFuncImgIndex === index ? 'opacity-50 ring-2 ring-indigo-500' : ''} bg-slate-50`}
                  draggable
                  onDragStart={() => handleFuncImgDragStart(index)}
                  onDragEnter={() => handleFuncImgDragEnter(index)}
                  onDragEnd={handleFuncImgDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <img src={img.url} className="w-full h-full object-cover" alt={`Func ${index}`} />
                  
                  {/* Edit Crop Button */}
                  <button 
                    onClick={() => setEditingFuncImageId(img.id)}
                    className="absolute bottom-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-600 z-10"
                    title="裁剪图片"
                  >
                    <Pencil size={12} />
                  </button>

                  {/* Delete Button */}
                  <button 
                    onClick={() => handleRemoveFuncImg(img.id)}
                    className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 z-10"
                    title="删除"
                  >
                    <X size={12} />
                  </button>

                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none flex items-end justify-center pb-2">
                    <span className="text-[10px] text-white bg-black/40 px-1.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none">拖拽排序</span>
                  </div>
                </div>
              ))}
              
              <div 
                onClick={() => funcImgInputRef.current?.click()}
                className={`group aspect-square border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors flex flex-col items-center justify-center text-center bg-white ${isProcessingImg ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {isProcessingImg ? (
                  <>
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin mb-1" />
                    <span className="text-[10px] text-indigo-500">处理中...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 mb-1" />
                    <span className="text-[10px] text-slate-500 group-hover:text-indigo-600">添加图片</span>
                  </>
                )}
                <input 
                  type="file" 
                  ref={funcImgInputRef} 
                  className="hidden" 
                  accept="image/*"
                  multiple
                  onChange={handleFuncImgUpload}
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400">
               * 图片将自动压缩并调整为 960px 宽。此区域图片仅在<b>导出</b>时下载（Zip包）。
            </p>
          </section>

          <hr className="border-slate-100" />

          {/* STEP 1: Existing Header Image */}
          <section className="space-y-4">
             <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[rgb(29,29,31)] uppercase tracking-wider">1. 头图设置</h2>
            </div>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="group border-2 border-dashed border-slate-300 rounded-lg p-4 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors flex flex-col items-center justify-center text-center h-24"
            >
              {isProcessingImg ? (
                <>
                   <Loader2 className="w-6 h-6 text-indigo-500 animate-spin mb-2" />
                   <span className="text-xs text-indigo-500">图片处理中...</span>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 mb-2" />
                  <span className="text-xs text-slate-500 group-hover:text-indigo-600">点击上传图片</span>
                </>
              )}
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
        <div className="px-[55px] pb-[21px] pt-6 bg-white border-t border-slate-200 shrink-0 flex gap-3">
          <button 
            onClick={handleOpenSaveModal}
            disabled={isSaving || isDownloading || isZipping}
            className="flex-1 py-3 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-300 shadow-sm"
          >
            {isSaving ? (
              <>
               <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
               保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {currentDraftId ? '更新草稿' : '保存草稿'}
              </>
            )}
          </button>

          {/* Combined Export Button */}
          <button 
            onClick={handleExportAll}
            disabled={isDownloading || isZipping || isSaving}
            className={`flex-[2] py-3 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 shadow-lg ${
              (isDownloading || isZipping) ? 'bg-slate-400 cursor-wait' : 'bg-[rgb(29,29,31)] hover:bg-black'
            }`}
          >
            {(isDownloading || isZipping) ? (
               <>
                 <RefreshCw className="w-4 h-4 animate-spin" />
                 {isZipping ? '打包中...' : '生成中...'}
               </>
            ) : (
               <>
                 <Download className="w-4 h-4" />
                 导出商品主图和详情图
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