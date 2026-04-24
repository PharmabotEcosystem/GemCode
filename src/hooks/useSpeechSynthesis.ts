import { useState, useRef, useCallback } from 'react';

/**
 * SpeechSynthesis hook for text-to-speech in the browser.
 * Can optionally delegate to a bridge TTS endpoint.
 */
export function useSpeechSynthesis() {
  const [isSpeaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = useCallback((text: string, lang = 'it-IT') => {
    if (!isSupported || !text.trim()) return;
    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    utt.rate = 1;
    utt.pitch = 1;

    // Try to find an Italian voice
    const voices = window.speechSynthesis.getVoices();
    const italianVoice = voices.find(v => v.lang.startsWith('it'));
    if (italianVoice) utt.voice = italianVoice;

    utt.onstart = () => setSpeaking(true);
    utt.onend = () => { setSpeaking(false); utteranceRef.current = null; };
    utt.onerror = () => { setSpeaking(false); utteranceRef.current = null; };

    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, [isSupported]);

  const speakViaBridge = useCallback(async (text: string, bridgeUrl: string, deviceId: string) => {
    if (!text.trim()) return;
    setSpeaking(true);
    try {
      await fetch(`${bridgeUrl.replace(/\/$/, '')}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, device_id: deviceId }),
      });
    } catch (e) {
      console.error('Bridge TTS error:', e);
    } finally {
      setSpeaking(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (isSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
    utteranceRef.current = null;
  }, [isSupported]);

  return { speak, speakViaBridge, stop, isSpeaking, isSupported };
}
