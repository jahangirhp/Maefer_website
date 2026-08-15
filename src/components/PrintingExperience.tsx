import { forwardRef } from "react";

const MEDIA_BASE = `${import.meta.env.BASE_URL}media/`;

const PrintingExperience = forwardRef<HTMLVideoElement>(
  function PrintingExperience(_, ref) {
    return (
      <div className="printing-film-frame">
        <video
          ref={ref}
          className="printing-film"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={`${MEDIA_BASE}section-01-poster.png`}
          aria-label="A modern print head slowly building a blue sculptural part one layer at a time"
        >
          <source src={`${MEDIA_BASE}section-01-print.mp4?v=12`} type="video/mp4" />
        </video>
      </div>
    );
  },
);

export default PrintingExperience;
