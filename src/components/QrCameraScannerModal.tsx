import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, RefreshCw, X, Upload, QrCode, CheckCircle2, AlertTriangle } from 'lucide-react';

interface QrCameraScannerModalProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
  sectorLabel: string;
}

export const QrCameraScannerModal: React.FC<QrCameraScannerModalProps> = ({
  onScanSuccess,
  onClose,
  sectorLabel,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(true);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number | null = null;
    let isCancelled = false;

    const stopCamera = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };

    const startCamera = async () => {
      setIsStarting(true);
      setCameraError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsStarting(false);
        setCameraError(
          'Seu navegador bloqueou o acesso direto ao vídeo ou não possui suporte. Use o botão abaixo "Abrir Câmera Nativa / Tirar Foto do QR-Code".'
        );
        return;
      }

      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          // Fallback to any available camera if ideal facingMode fails
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (isCancelled) {
          stopCamera();
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          setIsStarting(false);
          scanFrame();
        }
      } catch (err: any) {
        if (!isCancelled) {
          setIsStarting(false);
          setCameraError(
            'Não foi possível abrir o vídeo ao vivo (verifique a permissão de câmera do navegador) ou toque abaixo em "Abrir Câmera do Celular / Tablet (Foto)" para ler o QR-Code.'
          );
        }
      }
    };

    const scanFrame = () => {
      if (isCancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data && code.data.trim()) {
            const cleaned = code.data.trim().toUpperCase();
            setDetectedCode(cleaned);
            stopCamera();
            setTimeout(() => {
              onScanSuccess(cleaned);
              onClose();
            }, 250);
            return;
          }
        }
      }

      animationFrameId = requestAnimationFrame(scanFrame);
    };

    startCamera();

    return () => {
      isCancelled = true;
      stopCamera();
    };
  }, [facingMode, onScanSuccess, onClose]);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Scale image if very large for fast and accurate decoding
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (code && code.data && code.data.trim()) {
          const cleaned = code.data.trim().toUpperCase();
          setDetectedCode(cleaned);
          setTimeout(() => {
            onScanSuccess(cleaned);
            onClose();
          }, 200);
        } else {
          setCameraError(
            'Não foi possível identificar um QR-Code nítido na foto. Aproxime mais a câmera do QR-Code da Ficha e tente novamente.'
          );
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#081530] border-2 border-amber-500 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl text-white">
        {/* Top Header */}
        <div className="p-4 bg-slate-900/90 border-b border-blue-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500 text-slate-950">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block font-bold">
                Leitor Óptico por Câmera · {sectorLabel}
              </span>
              <h3 className="text-sm sm:text-base font-extrabold text-white">
                Aponte a Câmera para o QR-CODE da Ficha
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Live Viewfinder */}
        <div className="p-4 space-y-4">
          <div className="relative bg-black rounded-xl overflow-hidden aspect-4/3 flex items-center justify-center border-2 border-blue-800">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Scanning Target Frame Overlay */}
            {!cameraError && !detectedCode && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                <div className="w-52 h-52 sm:w-60 sm:h-60 border-2 border-amber-400 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                  <div className="w-6 h-6 border-t-4 border-l-4 border-amber-400 absolute -top-1 -left-1 rounded-tl-lg" />
                  <div className="w-6 h-6 border-t-4 border-r-4 border-amber-400 absolute -top-1 -right-1 rounded-tr-lg" />
                  <div className="w-6 h-6 border-b-4 border-l-4 border-amber-400 absolute -bottom-1 -left-1 rounded-bl-lg" />
                  <div className="w-6 h-6 border-b-4 border-r-4 border-amber-400 absolute -bottom-1 -right-1 rounded-br-lg" />
                  <div className="absolute inset-x-2 top-1/2 h-0.5 bg-red-500/90 animate-pulse" />
                </div>
                <span className="mt-3 px-3 py-1 rounded-full bg-slate-950/85 text-amber-300 font-mono text-xs font-bold">
                  {isStarting
                    ? 'Iniciando câmera do aparelho...'
                    : 'Centralize o QR-CODE da Ficha no quadrado'}
                </span>
              </div>
            )}

            {/* Detected Feedback */}
            {detectedCode && (
              <div className="absolute inset-0 bg-emerald-950/90 flex flex-col items-center justify-center p-6 text-center">
                <CheckCircle2 className="w-14 h-14 text-emerald-400 mb-2" />
                <p className="text-base font-extrabold text-white">QR-CODE Lido com Sucesso!</p>
                <p className="text-sm font-mono font-bold text-amber-300 mt-1">{detectedCode}</p>
              </div>
            )}

            {/* Camera Error / Fallback Notice */}
            {cameraError && (
              <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3">
                <AlertTriangle className="w-10 h-10 text-amber-400" />
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">{cameraError}</p>
              </div>
            )}
          </div>

          {/* Camera Controls & Native Mobile Camera Capture Fallback */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() =>
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              className="px-3.5 py-2.5 rounded-xl bg-blue-900/80 hover:bg-blue-800 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <span>
                Alternar Câmera ({facingMode === 'environment' ? 'Traseira' : 'Frontal'})
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Camera className="w-4 h-4" />
              <span>Abrir Câmera Nativa do Celular / Tirar Foto</span>
            </button>
          </div>

          <div className="p-3 rounded-xl bg-blue-950/80 border border-blue-800 text-[11px] text-blue-200 flex items-start gap-2">
            <QrCode className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Dica para Celular e Tablet:</strong> Assim que o QR-Code da Ficha (ex:{' '}
              <span className="font-mono text-amber-300">M2605206|403411|80</span>) aparecer na
              câmera, a leitura é automática e a metragem da pilha já é calculada no setor!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
