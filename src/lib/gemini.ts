import { GoogleGenAI, Type } from "@google/genai";
import { GenerationOptions, GeneratedCaption, Platform } from "../types";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || '' 
});

/**
 * Helper to retry a function with exponential backoff
 */
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 2, initialDelay = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      // Only retry on potential transient errors
      // xhr error code 6 is a common transient network failure in this environment
      const errMsg = error.message?.toLowerCase() || "";
      const isTransient = 
        errMsg.includes("fetch") || 
        errMsg.includes("xhr") || 
        errMsg.includes("500") || 
        errMsg.includes("unknown") ||
        errMsg.includes("socket") ||
        errMsg.includes("proxyunarycall") ||
        errMsg.includes("code: 6");

      if (!isTransient || i === maxRetries) break;
      
      const delay = initialDelay * Math.pow(2, i);
      console.warn(`Gemini API: Transient error, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Maps complex Gemini/Network errors to user-friendly messages with solutions
 */
function handleGeminiError(error: any): Error {
  console.error("Gemini API Error Detail:", error);
  
  const errMsg = error.message?.toLowerCase() || "";
  const status = error.status || "";

  if (errMsg.includes("xhr") || errMsg.includes("makersuite") || errMsg.includes("code: 6") || errMsg.includes("proxyunarycall")) {
    return new Error("Connection Interrupted: The request failed due to a temporary network issue. Solution: Please click 'Generate' again.");
  }

  if (errMsg.includes("fetch") || errMsg.includes("socket") || errMsg.includes("network")) {
    return new Error("Network Error: Could not reach the Gemini API. Solution: Please check your internet connection and try again.");
  }
  
  if (errMsg.includes("api key") || errMsg.includes("api_key") || errMsg.includes("invalid") || errMsg.includes("unauthenticated") || status === "UNAUTHENTICATED") {
    return new Error("Authentication Failed: The Gemini API key is missing or invalid. Solution: Ensure you have added a valid API key in the settings.");
  }

  if (errMsg.includes("quota") || errMsg.includes("429") || status === "RESOURCE_EXHAUSTED" || errMsg.includes("limit")) {
    return new Error("Usage Limit Reached: You've hit the Gemini API rate limit. Solution: Please wait a few minutes before trying again.");
  }

  if (errMsg.includes("image") || errMsg.includes("unsupported") || errMsg.includes("format") || errMsg.includes("binary")) {
    return new Error("Image Issue: The uploaded file is corrupted or in an unsupported format. Solution: Try uploading a different JPG, PNG, or WebP file.");
  }

  if (errMsg.includes("safety") || errMsg.includes("candidate") || errMsg.includes("blocked") || status === "SAFETY") {
    return new Error("Content Blocked: The request matches Gemini's safety filter criteria. Solution: Try rephrasing your context to be more neutral.");
  }

  if (status === "PERMISSION_DENIED" || errMsg.includes("permission")) {
    return new Error("Permission Denied: Your API key does not have access to this model. Solution: Verify your API key permissions in the Google AI Studio console.");
  }

  if (errMsg.includes("unavailable") || status === "UNAVAILABLE" || errMsg.includes("503") || errMsg.includes("overloaded")) {
    return new Error("Server Unavailable: The Gemini service is currently overloaded or down. Solution: Please try again in 5-10 minutes.");
  }
  
  return new Error(`Unexpected Error: ${error.message || "An unknown error occurred."} Solution: Refresh the page and try again.`);
}

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
  return retryWithBackoff(async () => {
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
      throw new Error("API Key Missing: GEMINI_API_KEY is not configured. Solution: Please add it to your environment variables.");
    }

    try {
      const response = await ai.models.generateContent(request);
      
      if (!response?.text) {
        throw new Error("No Content Received: The AI returned an empty response. Solution: Try providing more context or a different image.");
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
      throw handleGeminiError(error);
    }
  });
}

export async function suggestHashtags(
  caption: string,
  visualAnalysis: string | null = null,
  context: string = ""
): Promise<string[]> {
  return retryWithBackoff(async () => {
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

    try {
      const response = await ai.models.generateContent(request);
      if (!response?.text) return [];
      return JSON.parse(response.text.trim());
    } catch (error) {
      throw handleGeminiError(error);
    }
  });
}
