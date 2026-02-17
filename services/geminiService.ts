
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Modality } from "@google/genai";
import { RouteDetails, StorySegment, StoryStyle } from "../types";
import { base64ToArrayBuffer, pcmToWav } from "./audioUtils";

const RAW_API_KEY = process.env.API_KEY;
const API_KEY = RAW_API_KEY ? RAW_API_KEY.replace(/["']/g, "").trim() : "";

const ai = new GoogleGenAI({ apiKey: API_KEY });

const TARGET_SEGMENT_DURATION_SEC = 60; 
// Calibrated for natural Russian speech flow
const WORDS_PER_MINUTE = 85; 
const WORDS_PER_SEGMENT = Math.round((TARGET_SEGMENT_DURATION_SEC / 60) * WORDS_PER_MINUTE);

export const calculateTotalSegments = (durationSeconds: number): number => {
    return Math.max(1, Math.ceil(durationSeconds / TARGET_SEGMENT_DURATION_SEC));
};

const getStyleInstruction = (style: StoryStyle): string => {
    switch (style) {
        case 'NOIR':
            return "Стиль: Нуарный триллер. Мрачный, циничный, атмосферный. Используй внутренний монолог. Путешественник — это детектив или человек с темным прошлым. Город — это отдельный персонаж: холодный, дождливый, скрывающий тайны. Используй метафоры теней, дыма и холодного неона.";
        case 'CHILDREN':
            return "Стиль: Детская сказка. Причудливая, волшебная, полная чудес и мягкого юморa. Мир яркий и живой; возможно, неодушевленные предметы (светофоры или деревья) обладают характером. Простой, но выразительный язык.";
        case 'HISTORICAL':
            return "Стиль: Исторический эпос. Величественный, драматичный и вневременной. Относись к путешествию как к важному паломничеству или квесту в ушедшую эпоху. Используй возвышенный язык. Фокус на выносливости, судьбе и грузе истории.";
        case 'FANTASY':
            return "Стиль: Фэнтези-приключение. Героический, мистический и эпический. Реальный мир — лишь завеса над магическим королевством. Улицы — древние тропы, здания — башни или руины. Путешественник на важном задании. Метафоры магии и мифических существ.";
        case 'CYBERPUNK':
            return "Стиль: Киберпанк. Высокие технологии, низкий уровень жизни. Город пронизан проводами, голограммами и неоном. Путешественник — наемник или хакер на опасном задании. Мир аугментаций, мегакорпораций и цифрового шума. Используй сленг будущего и технические термины.";
        case 'ADVENTURE':
            return "Стиль: Дерзкое приключение. Энергичный, захватывающий, в духе классики 'Индианы Джонса'. Путешественник — исследователь, открывающий древние тайны за обычными городскими фасадами. Каждее препятствие — это испытание ловкости или ума. Используй динамичный, воодушевляющий язык.";
        case 'ZEN':
            return "Стиль: Дзен-медитация. Тихий, философский, созерцательный. Фокус на дыхании, звуках шагов, текстуре дороги и моменте 'здесь и сейчас'. Поиск глубокой красоты в повседневных мелочах. Медленный темп повествования, много пауз и глубоких размышлений.";
        default:
            return "Стиль: Иммерсивное повествование 'в моменте'. Фокус на ощущениях от движения и окружающей обстановке.";
    }
};

export const generateStoryOutline = async (
    route: RouteDetails,
    totalSegments: number
): Promise<string[]> => {
    const styleInstruction = getStyleInstruction(route.storyStyle);
    const prompt = `
    Ты эксперт-рассказчик. Составь план истории на РУССКОМ ЯЗЫКЕ, которая состоит ровно из ${totalSegments} глав.
    История должна иметь цельную структуру: завязка, развитие, кульминация и развязка.

    План должен быть адаптирован под это путешествие:
    Маршрут: от ${route.startAddress} до ${route.endAddress} (${route.travelMode === 'DRIVING' ? 'на машине' : 'пешком'}).
    Общая длительность: около ${route.duration}.
    Количество глав: ${totalSegments}.
    
    ${styleInstruction}

    Выведи строго валидный JSON: массив из ${totalSegments} строк. Пример: ["Глава 1: Краткое содержание...", "Глава 2: Краткое содержание...", ...]
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });

        const text = response.text?.trim();
        if (!text) throw new Error("No outline generated.");
        
        const outline = JSON.parse(text);
        if (!Array.isArray(outline) || outline.length === 0) {
             throw new Error("Invalid outline format received.");
        }

        while (outline.length < totalSegments) {
            outline.push("Продолжение захватывающего путешествия.");
        }

        return outline.slice(0, totalSegments);

    } catch (error) {
        console.error("Outline Generation Error:", error);
        return Array(totalSegments).fill("Продолжение иммерсивного повествования о пути.");
    }
};

export const generateSegment = async (
    route: RouteDetails,
    segmentIndex: number,
    totalSegmentsEstimate: number,
    segmentOutline: string,
    previousContext: string = ""
): Promise<StorySegment> => {

  const isFirst = segmentIndex === 1;

  let contextPrompt = "";
  if (!isFirst) {
      contextPrompt = `
      КОНТЕКСТ ПРЕДЫДУЩИХ ГЛАВ (История на данный момент):
      ...${previousContext.slice(-1500)} 
      (ПРОДОЛЖАЙ БЕСШОВНО на РУССКОМ ЯЗЫКЕ. Не повторяйся. Не начинай каждую главу одинаковыми фразами.)
      `;
  }

  const styleInstruction = getStyleInstruction(route.storyStyle);

  const prompt = `
    Ты — ИИ-движок для создания иммерсивного аудиоповествования на РУССКОМ ЯЗЫКЕ.
    Путешествие: от ${route.startAddress} до ${route.endAddress} (${route.travelMode === 'DRIVING' ? 'на машине' : 'пешком'}).
    Статус: Сегмент ${segmentIndex} из примерно ${totalSegmentsEstimate}.
    
    ${styleInstruction}

    ЦЕЛЬ ТЕКУЩЕЙ ГЛАВЫ: ${segmentOutline}

    ${contextPrompt}

    Задача: Напиши текст для следующих ~60 секунд озвучки (около ${WORDS_PER_SEGMENT} слов) на основе Цели текущей главы.
    Повествование должно двигаться вперед. Это фрагмент длинного пути.

    ВАЖНО: Выдай ТОЛЬКО текст повествования на РУССКОМ ЯЗЫКЕ. Без заголовков и JSON. Только живая речь.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    const text = response.text?.trim();
    if (!text) throw new Error("No text generated for segment.");

    return {
      index: segmentIndex,
      text: text,
      audioBuffer: null 
    };

  } catch (error) {
    console.error(`Segment ${segmentIndex} Text Generation Error:`, error);
    throw error;
  }
};

export const generateSegmentAudio = async (text: string, audioContext: AudioContext, voiceName: string = 'Zephyr'): Promise<AudioBuffer> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } }
        }
      }
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    const audioData = part?.inlineData?.data;
    if (!audioData) throw new Error("No audio data received from Gemini TTS.");

    const mimeType = part?.inlineData?.mimeType || "audio/pcm;rate=24000";
    const match = mimeType.match(/rate=(\d+)/);
    const sampleRate = match ? parseInt(match[1], 10) : 24000;

    const wavArrayBuffer = await pcmToWav(base64ToArrayBuffer(audioData), sampleRate).arrayBuffer();
    return await audioContext.decodeAudioData(wavArrayBuffer);

  } catch (error) {
    console.error("Audio Generation Error:", error);
    throw error;
  }
};
