import { forwardRef } from "react";

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
          poster="/media/section-01-poster.png"
          aria-label="A modern print head slowly building a blue sculptural part one layer at a time"
        >
          <source src="/media/section-01-print.mp4?v=5" type="video/mp4" />
        </video>
      </div>
    );
  },
);

export default PrintingExperience;
