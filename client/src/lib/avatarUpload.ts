import { fileToLocalImageDataUrl } from './localImage';

export const fileToAvatarDataUrl = async (file: File): Promise<string> => {
  return fileToLocalImageDataUrl(file, {
    maxDimension: 512,
    maxFileBytes: 8 * 1024 * 1024,
    outputType: 'image/jpeg',
    quality: 0.82,
    fileTooLargeMessage: 'Please choose an image smaller than 8MB',
  });
};
