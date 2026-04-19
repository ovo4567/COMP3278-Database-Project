type LocalImageOptions = {
  maxDimension: number;
  maxFileBytes: number;
  outputType?: string;
  quality?: number;
  fileTooLargeMessage: string;
};

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to read image file'));
    };
    image.src = objectUrl;
  });

const canvasToDataUrl = (
  canvas: HTMLCanvasElement,
  outputType: string,
  quality: number,
): Promise<string> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode image'));
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error('Failed to read encoded image'));
            return;
          }
          resolve(reader.result);
        };
        reader.onerror = () => reject(new Error('Failed to read encoded image'));
        reader.readAsDataURL(blob);
      },
      outputType,
      quality,
    );
  });

export const fileToLocalImageDataUrl = async (file: File, options: LocalImageOptions): Promise<string> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file');
  }

  if (file.size > options.maxFileBytes) {
    throw new Error(options.fileTooLargeMessage);
  }

  const image = await loadImageFromFile(file);
  const scale = Math.min(1, options.maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser');

  ctx.drawImage(image, 0, 0, width, height);
  return canvasToDataUrl(canvas, options.outputType ?? 'image/jpeg', options.quality ?? 0.82);
};
