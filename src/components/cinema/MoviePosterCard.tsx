import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Heart, Play } from 'lucide-react';
import type { MovieRecord } from '../../types/cinema';
import { formatTimestamp } from '../../utils/playbackSync';
import { formatBytes } from '../../utils/uploadLogic';

interface MoviePosterCardProps {
  movie: MovieRecord;
  onToggleFavourite?: (movie: MovieRecord) => void;
  onStartWatch?: (movie: MovieRecord) => void;
}

export function MoviePosterCard({ movie, onToggleFavourite, onStartWatch }: MoviePosterCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const progressPct =
    movie.durationSeconds > 0
      ? Math.min(100, Math.round((movie.playbackProgress / movie.durationSeconds) * 100))
      : 0;

  return (
    <article className="group cinema-surface rounded-xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-1">
      <div className="relative aspect-[3/4] bg-[#151126] overflow-hidden">
        {!imgFailed && movie.thumbnailUrl ? (
          <img
            src={movie.thumbnailUrl}
            alt={`${movie.title} poster`}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-[#211B32] via-[#151126] to-[#080810]">
            <Film className="w-10 h-10 text-[#C4B5FD] mb-3" />
            <span className="font-display font-semibold text-white text-sm line-clamp-2">{movie.title}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#080810] via-[#080810]/30 to-transparent" />

        {onToggleFavourite && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onToggleFavourite(movie);
            }}
            aria-label={movie.isFavourite ? `Remove ${movie.title} from favourites` : `Favourite ${movie.title}`}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[#080810]/80 border border-white/10 flex items-center justify-center text-slate-200 hover:text-[#F472B6] transition-colors cursor-pointer"
          >
            <Heart className={`w-4 h-4 ${movie.isFavourite ? 'fill-[#F472B6] text-[#F472B6]' : ''}`} />
          </button>
        )}

        {progressPct > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/15">
            <div className="h-full bg-[#8B5CF6]" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <Link
            to={`/movies/${movie.id}`}
            className="font-display font-semibold text-base text-white hover:text-[#C4B5FD] transition-colors line-clamp-1"
          >
            {movie.title}
          </Link>
          <p className="mt-1 text-xs text-[#C4B5FD]/80 tabular-nums">
            <span>{movie.genre}</span>
            <span aria-hidden="true"> · </span>
            <span>{movie.resolution}</span>
            <span aria-hidden="true"> · </span>
            <span>{formatBytes(movie.fileSizeBytes)}</span>
          </p>
          <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed">{movie.description}</p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs">
          <span className="font-mono-tabular text-slate-400">
            {movie.durationSeconds > 0 ? formatTimestamp(movie.durationSeconds) : 'Ready'}
          </span>
          <div className="flex items-center gap-2">
            <Link
              to={`/movies/${movie.id}`}
              className="px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap"
            >
              Details
            </Link>
            {onStartWatch && (
              <button
                type="button"
                onClick={() => onStartWatch(movie)}
                className="px-3 py-1.5 rounded-md bg-[#8B5CF6] hover:bg-[#9167FF] text-white font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Watch</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
