// Formas de avisar que se disparó una alerta: sonido, notificación del sistema y título de la pestaña.

// Sonido corto de dos tonos, generado con Web Audio (sin archivos de audio).
let audioCtx;
export function playChime() {
  try {
    audioCtx ||= new AudioContext();
    const now = audioCtx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.35);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.4);
    });
  } catch {
    /* sin audio: queda el aviso visual */
  }
}

// El navegador solo deja sonar audio después de que el usuario interactuó con la página:
// esto "despierta" el audio en el primer clic.
export function unlockAudio() {
  try {
    audioCtx ||= new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    /* sin audio */
  }
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notificationsGranted = () => notificationsSupported() && Notification.permission === 'granted';

export async function askNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

export function systemNotification(title, body, onClick) {
  if (!notificationsGranted()) return;
  try {
    const n = new Notification(title, { body, tag: `${title}-${Date.now()}` });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    /* algunos navegadores en celular no permiten notificaciones así */
  }
}

// Título de la pestaña que parpadea hasta que volvés a la página.
let blinkTimer;
export function blinkTitle(text) {
  const original = document.title.replace(/^🔔 .*? · /, '');
  clearInterval(blinkTimer);
  let on = true;
  blinkTimer = setInterval(() => {
    document.title = on ? `🔔 ${text} · ${original}` : original;
    on = !on;
  }, 1000);
  const stop = () => {
    if (document.hidden) return;
    clearInterval(blinkTimer);
    document.title = original;
    document.removeEventListener('visibilitychange', stop);
  };
  document.addEventListener('visibilitychange', stop);
  if (!document.hidden) setTimeout(stop, 6000);
}
