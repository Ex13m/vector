// Экспорт текстового файла: на APK — запись в Cache + системный share-лист
// (Android WebView игнорирует <a download> для blob), на web — anchor-загрузка.
import { Capacitor } from '@capacitor/core';

export async function exportTextFile(
  filename: string,
  content: string,
  mime = 'text/plain',
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const res = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: filename, url: res.uri, dialogTitle: filename });
    } catch (e) {
      console.warn('[export] native failed:', e);
    }
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
