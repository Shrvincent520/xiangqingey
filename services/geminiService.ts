import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PosterData, PosterDetail } from "../types";

const apiKey = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });

const posterSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "The main attractive title of the event (max 10 chars)" },
    subTitle: { type: Type.STRING, description: "A catchy subtitle or slogan (max 15 chars)" },
    date: { type: Type.STRING, description: "Date of the event (e.g., '5月20日')" },
    time: { type: Type.STRING, description: "Time range (e.g., '14:00 - 16:00')" },
    location: { type: Type.STRING, description: "Short address or venue name" },
    phone: { type: Type.STRING, description: "Contact phone number" },
    notes: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING }, 
      description: "List of 2-3 short important notes (e.g., 'Self-drive recommended', 'No pets')" 
    },
    marketingCopy: { 
      type: Type.STRING, 
      description: "A beautifully written, poetic, and engaging marketing paragraph describing the event atmosphere. Target length: 80-100 words. Fluent Chinese." 
    },
  },
  required: ["title", "subTitle", "date", "time", "location", "marketingCopy"],
};

export const analyzeText = async (text: string): Promise<PosterData> => {
  try {
    const model = "gemini-3-flash-preview";
    
    const prompt = `
      You are an expert copywriter and event planner assistant.
      Analyze the following unstructured user input describing an activity or product.
      Extract key information and generate a polished marketing copy.
      
      User Input:
      "${text}"
      
      Requirements:
      1. Refine the 'marketingCopy' to be elegant and appealing, suitable for a high-end poster.
      2. If information is missing, make a reasonable educated guess or leave generic placeholders (e.g., "待定").
      3. Ensure the tone is inviting.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: posterSchema,
        temperature: 0.7,
      },
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");

    const parsedData = JSON.parse(jsonText);
    
    // Map the AI response to the new data structure with dynamic details
    const details: PosterDetail[] = [];
    
    if (parsedData.title) {
      details.push({ id: 'd-title', label: '活动名称', value: parsedData.title });
    }
    
    if (parsedData.date || parsedData.time) {
      // Use <br/> for HTML line breaks in rich text editor
      const timeStr = [parsedData.date, parsedData.time].filter(Boolean).join('<br/>');
      details.push({ id: 'd-time', label: '活动时间', value: timeStr });
    }
    
    if (parsedData.location) {
      details.push({ id: 'd-loc', label: '使用地点', value: parsedData.location });
    }
    
    if (parsedData.phone) {
      details.push({ id: 'd-phone', label: '联系电话', value: parsedData.phone });
    }
    
    if (parsedData.notes && Array.isArray(parsedData.notes) && parsedData.notes.length > 0) {
      const notesStr = parsedData.notes.map((n: string) => `• ${n}`).join('<br/>');
      details.push({ id: 'd-notes', label: '注意事项', value: notesStr });
    }
    
    const posterData: PosterData = {
      subTitle: parsedData.subTitle,
      details: details,
      marketingCopy: parsedData.marketingCopy,
      content: [
        {
          id: Date.now().toString(),
          type: 'text',
          value: parsedData.marketingCopy || ''
        }
      ]
    };

    return posterData;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};