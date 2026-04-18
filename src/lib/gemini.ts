import { GoogleGenAI, Type } from "@google/genai";
import { GenerationOptions, GeneratedCaption, Platform } from "../types";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || '' 
});

export interface GenerationResult {
  captions: GeneratedCaption[];
  visualAnalysis: string;
}

export async function generateCaptions(
  imageDescription: string | null,
  context: string,
  options: GenerationOptions,
  templateStructure: string | null = null
): Promise<GenerationResult> {
  const model = "gemini-3-flash-preview";
  
  const templateInstruction = templateStructure 
    ? `\n\nCRITICAL: You MUST use the following caption structure/template for EVERY variation:
"${templateStructure}"
Complete the bracketed sections or placeholders within this structure using details from the image and context.` : '';

  const prompt = `You are an expert social media copywriter and visual storyteller. 
Analyze the provided ${imageDescription ? 'image (base64 data provided)' : 'context'} and any additional information. 
Generate ${options.variationCount} highly engaging captions optimized for ${options.platforms.join(', ')}.${templateInstruction}

Key rules:
- Match the selected tone perfectly: ${options.tone}.
- Target length: ${options.length} (${options.length === 'Short' ? '1-2 lines' : options.length === 'Medium' ? '3-5 lines' : 'story-style'}).
- Emojis: ${options.includeEmojis ? 'Use naturally where they enhance emotion' : 'Do not use emojis'}.
- Hashtags: ${options.includeHashtags ? 'Include 3-8 relevant, trending-style hashtags' : 'Do not include hashtags'}.
- Call-to-Action (CTA): ${options.includeCTA ? 'Add a strong, relevant call-to-action' : 'Do not include a CTA'}.
- Language: ${options.language}.
- Make captions feel authentic and human — avoid generic AI fluff.
- Vary the structure across variations.
- For Instagram/TikTok: Focus on visual and emotional hooks.
- For LinkedIn: Focus on value, professional insights, or thought leadership.
- If an image is provided, describe key elements subtly without stating the obvious.
- Focus on the visual details provided.

Additional user input/context: ${context || 'No additional context provided.'}

Return the response as a JSON object with:
1. 'captions': An array of objects, where each object has a 'text' property (the caption) and a 'platform' property (one of the requested platforms).
2. 'visualAnalysis': A concise but detailed 2-3 sentence description of the image's content, colors, mood, and key subjects (Internal use only).`;

  const request: any = {
    model,
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          captions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                platform: { type: Type.STRING },
              },
              required: ["text", "platform"],
            },
          },
          visualAnalysis: { type: Type.STRING },
        },
        required: ["captions", "visualAnalysis"],
      },
    },
  };

  // If we have an image, add it to the contents
  if (imageDescription) {
    const [mimeInfo, base64Data] = imageDescription.split(';base64,');
    const mimeType = mimeInfo.split(':')[1];
    
    request.contents = {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data,
          },
        },
        { text: prompt },
      ],
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("API Key Missing: GEMINI_API_KEY is not configured. Please add it to your environment variables.");
  }

  try {
    const response = await ai.models.generateContent(request);
    
    if (!response?.text) {
      throw new Error("No Content Received: The AI returned an empty response. Try providing more context or a different image.");
    }

    const rawData = JSON.parse(response.text.trim());
    return {
      captions: rawData.captions.map((item: any) => ({
        id: crypto.randomUUID(),
        text: item.text,
        platform: item.platform as Platform,
        tone: options.tone,
        timestamp: Date.now(),
      })),
      visualAnalysis: rawData.visualAnalysis
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    // Categorize errors for better user UX
    if (error.message?.includes("fetch")) {
      throw new Error("Network Error: Could not reach the Gemini API. Please check your internet connection.");
    }
    
    if (error.message?.includes("quota") || error.message?.includes("429")) {
      throw new Error("Usage Limit Reached: You've hit the Gemini API quota. Please try again in a few minutes.");
    }

    if (error.message?.includes("image") || error.message?.includes("unsupported")) {
      throw new Error("Image Error: One or more images might be corrupted or in an unsupported format. Try a different file.");
    }

    if (error.message?.includes("safety") || error.message?.includes("candidate")) {
      throw new Error("Content Safety: The request was flagged by Gemini's safety filters. Try wording your context differently.");
    }
    
    throw error;
  }
}

export async function suggestHashtags(
  caption: string,
  visualAnalysis: string | null = null,
  context: string = ""
): Promise<string[]> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `You are a social media strategist. 
Based on the following caption and context, suggest 15 highly relevant, trending-style hashtags.
${visualAnalysis ? `Visual content details (use this for hashtag relevance): "${visualAnalysis}"` : ''}

Caption: "${caption}"
Context: "${context}"

Return exactly a JSON array of strings, each starting with #.`;

  const request: any = {
    model,
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
  };

  // We no longer send the image binary here if visualAnalysis is provided!
  // This makes the second turn MUCH faster.
  if (!visualAnalysis && false) { // Kept legacy logic just in case but disabled for speed
    // ...
  }

  try {
    const response = await ai.models.generateContent(request);
    if (!response?.text) return [];
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Hashtag Suggestion Error:", error);
    return [];
  }
}
