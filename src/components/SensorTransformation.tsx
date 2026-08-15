import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import PrintingExperience from "./PrintingExperience";

gsap.registerPlugin(ScrollTrigger);

type ChartCard = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Particle = {
  group: 0 | 1;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  qrX: number;
  qrY: number;
  curlX: number;
  curlY: number;
  qrCurlX: number;
  qrCurlY: number;
  ashAngle: number;
  ashSpread: number;
  ashSize: number;
  ashSpin: number;
  delay: number;
  radius: number;
};

type SourceSample = {
  x: number;
  y: number;
};

type Point = {
  x: number;
  y: number;
};

type CapturedFrame = {
  element: HTMLCanvasElement;
  width: number;
  height: number;
};

const BLUE = [28, 111, 246] as const;
const RED = [239, 70, 83] as const;
const QR_DARK = [112, 225, 248] as const;
const ASH_BLUE = [88, 176, 255] as const;
const ASH_PALE = [178, 236, 246] as const;
const PARTICLES_DESKTOP = 1800;
const PARTICLES_MOBILE = 1000;
const SENSOR_PHASE_END = 0.34;
const QR_PHASE_START = 0.39;
const QR_PHASE_END = 0.63;
const INTEGRATION_PHASE_START = 0.68;
const INTEGRATION_PHASE_END = 0.97;

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edgeStart: number, edgeEnd: number, value: number) {
  const progress = clamp((value - edgeStart) / (edgeEnd - edgeStart));
  return progress * progress * (3 - 2 * progress);
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function getCards(width: number, height: number): [ChartCard, ChartCard] {
  if (width < 760) {
    const cardWidth = Math.min(width - 42, 560);
    const cardHeight = Math.min(height * 0.31, 245);
    const x = (width - cardWidth) / 2;
    return [
      { x, y: height * 0.17, width: cardWidth, height: cardHeight },
      {
        x,
        y: height * 0.53,
        width: cardWidth,
        height: cardHeight,
      },
    ];
  }

  const gap = clamp(width * 0.035, 36, 70);
  const cardWidth = Math.min((width - gap - width * 0.14) / 2, 680);
  const cardHeight = Math.min(height * 0.54, 500);
  const combinedWidth = cardWidth * 2 + gap;
  const startX = (width - combinedWidth) / 2;
  const y = height * 0.24;
  return [
    { x: startX, y, width: cardWidth, height: cardHeight },
    { x: startX + cardWidth + gap, y, width: cardWidth, height: cardHeight },
  ];
}

function getQrLayout(width: number, height: number) {
  const compact = width < 760;
  const codeSize = compact
    ? Math.min(width * 0.72, height * 0.41, 330)
    : Math.min(width * 0.32, height * 0.55, 520);
  const cardPadding = compact ? 28 : 42;
  const cardSize = codeSize + cardPadding * 2;

  return {
    codeSize,
    cardPadding,
    cardSize,
    cardX: (width - cardSize) / 2,
    cardY: (height - cardSize) / 2,
    codeX: (width - codeSize) / 2,
    codeY: (height - codeSize) / 2,
  };
}

function buildQrModules() {
  const size = 29;
  const modules: Array<[number, number]> = [];
  const random = seededRandom(32452843);

  const finderValue = (row: number, column: number) => {
    for (const [originRow, originColumn] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ] as const) {
      const localRow = row - originRow;
      const localColumn = column - originColumn;
      if (
        localRow >= -1 &&
        localRow <= 7 &&
        localColumn >= -1 &&
        localColumn <= 7
      ) {
        if (
          localRow < 0 ||
          localRow > 6 ||
          localColumn < 0 ||
          localColumn > 6
        ) {
          return false;
        }
        return (
          localRow === 0 ||
          localRow === 6 ||
          localColumn === 0 ||
          localColumn === 6 ||
          (localRow >= 2 &&
            localRow <= 4 &&
            localColumn >= 2 &&
            localColumn <= 4)
        );
      }
    }
    return null;
  };

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const finder = finderValue(row, column);
      const timing =
        finder === null &&
        ((row === 6 && column > 7 && column < size - 8) ||
          (column === 6 && row > 7 && row < size - 8));
      const filled =
        finder ?? (timing ? (row + column) % 2 === 0 : random() > 0.5);
      if (filled) modules.push([row, column]);
    }
  }

  return { modules, size };
}

const QR_MODULES = buildQrModules();

function qrTarget(
  index: number,
  width: number,
  height: number,
  random: () => number,
) {
  const layout = getQrLayout(width, height);
  const module =
    QR_MODULES.modules[
      (index * 149) % QR_MODULES.modules.length
    ];
  const repetition = Math.floor(index / QR_MODULES.modules.length) % 4;
  const offsets = [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ] as const;
  const cellSize = layout.codeSize / QR_MODULES.size;
  const [offsetX, offsetY] = offsets[repetition];

  return {
    x:
      layout.codeX +
      (module[1] + offsetX) * cellSize +
      (random() - 0.5) * cellSize * 0.1,
    y:
      layout.codeY +
      (module[0] + offsetY) * cellSize +
      (random() - 0.5) * cellSize * 0.1,
  };
}

function temperatureValue(progress: number) {
  return (
    0.52 +
    Math.sin(progress * Math.PI * 2.35 - 0.5) * 0.17 +
    Math.sin(progress * Math.PI * 7.1) * 0.055 +
    progress * 0.06
  );
}

function humidityValue(progress: number) {
  return (
    0.47 +
    Math.sin(progress * Math.PI * 1.75 + 0.9) * 0.16 +
    Math.cos(progress * Math.PI * 6.4) * 0.045 -
    progress * 0.04
  );
}

function chartTarget(
  card: ChartCard,
  group: 0 | 1,
  localIndex: number,
  groupCount: number,
  random: () => number,
) {
  const plotLeft = card.x + card.width * 0.105;
  const plotRight = card.x + card.width * 0.93;
  const plotTop = card.y + card.height * 0.31;
  const plotBottom = card.y + card.height * 0.82;
  const pointsPerBand = Math.max(1, Math.ceil(groupCount / 3));
  const lineProgress = (localIndex % pointsPerBand) / Math.max(1, pointsPerBand - 1);
  const band = Math.floor(localIndex / pointsPerBand) - 1;
  const normalizedValue =
    group === 0
      ? temperatureValue(lineProgress)
      : humidityValue(lineProgress);
  const jitter = band * 3.1 + (random() - 0.5) * 2.4;

  return {
    x: lerp(plotLeft, plotRight, lineProgress) + (random() - 0.5) * 1.8,
    y: lerp(plotBottom, plotTop, normalizedValue) + jitter,
  };
}

function getMediaPlacement(
  frame: CapturedFrame,
  width: number,
  height: number,
) {
  const scale = height > width
    ? Math.min(width / frame.width, height / frame.height)
    : Math.max(width / frame.width, height / frame.height);
  const renderedWidth = frame.width * scale;
  const renderedHeight = frame.height * scale;

  return {
    x: (width - renderedWidth) * 0.5,
    y: (height - renderedHeight) * 0.52,
    width: renderedWidth,
    height: renderedHeight,
  };
}

function getMediaCoverPlacement(
  frame: CapturedFrame,
  width: number,
  height: number,
) {
  const scale = Math.max(width / frame.width, height / frame.height) * 1.08;
  const renderedWidth = frame.width * scale;
  const renderedHeight = frame.height * scale;

  return {
    x: (width - renderedWidth) * 0.5,
    y: (height - renderedHeight) * 0.5,
    width: renderedWidth,
    height: renderedHeight,
  };
}

function extractPartSamples(
  samplingCanvas: HTMLCanvasElement,
  count: number,
): SourceSample[] {
  const context = samplingCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];

  const pixels = context.getImageData(
    0,
    0,
    samplingCanvas.width,
    samplingCanvas.height,
  ).data;
  const step = 2;
  const gridWidth = Math.ceil(samplingCanvas.width / step);
  const gridHeight = Math.ceil(samplingCanvas.height / step);
  const mask = new Uint8Array(gridWidth * gridHeight);

  for (
    let gridY = Math.floor(gridHeight * 0.08);
    gridY < gridHeight * 0.8;
    gridY += 1
  ) {
    for (
      let gridX = Math.floor(gridWidth * 0.28);
      gridX < gridWidth * 0.72;
      gridX += 1
    ) {
      const x = gridX * step;
      const y = gridY * step;
      const offset = (y * samplingCanvas.width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const isPrintedBlue =
        blue > 120 &&
        blue > red * 1.13 &&
        blue > green * 1.08 &&
        blue - Math.min(red, green) > 34;

      if (isPrintedBlue) {
        mask[gridY * gridWidth + gridX] = 1;
      }
    }
  }

  // The printed material sits close to the nozzle and center of the build
  // plate. Prefer that region and reject wide, flat blue bed-edge highlights.
  const queueX = new Int32Array(mask.length);
  const queueY = new Int32Array(mask.length);
  let printedComponent: SourceSample[] = [];
  let printedScore = Number.NEGATIVE_INFINITY;
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ] as const;

  for (let startY = 0; startY < gridHeight; startY += 1) {
    for (let startX = 0; startX < gridWidth; startX += 1) {
      const startOffset = startY * gridWidth + startX;
      if (!mask[startOffset]) continue;

      let head = 0;
      let tail = 1;
      let minimumX = startX;
      let maximumX = startX;
      let minimumY = startY;
      let maximumY = startY;
      const component: SourceSample[] = [];
      queueX[0] = startX;
      queueY[0] = startY;
      mask[startOffset] = 0;

      while (head < tail) {
        const gridX = queueX[head];
        const gridY = queueY[head];
        head += 1;
        minimumX = Math.min(minimumX, gridX);
        maximumX = Math.max(maximumX, gridX);
        minimumY = Math.min(minimumY, gridY);
        maximumY = Math.max(maximumY, gridY);
        component.push({
          x: (gridX * step) / samplingCanvas.width,
          y: (gridY * step) / samplingCanvas.height,
        });

        for (const [offsetX, offsetY] of neighbors) {
          const neighborX = gridX + offsetX;
          const neighborY = gridY + offsetY;
          if (
            neighborX < 0 ||
            neighborX >= gridWidth ||
            neighborY < 0 ||
            neighborY >= gridHeight
          ) {
            continue;
          }
          const neighborOffset = neighborY * gridWidth + neighborX;
          if (!mask[neighborOffset]) continue;
          mask[neighborOffset] = 0;
          queueX[tail] = neighborX;
          queueY[tail] = neighborY;
          tail += 1;
        }
      }

      const centerX = (minimumX + maximumX) / (2 * gridWidth);
      const centerY = (minimumY + maximumY) / (2 * gridHeight);
      const bottom = maximumY / gridHeight;
      const componentWidth = (maximumX - minimumX) / gridWidth;
      const componentHeight = (maximumY - minimumY) / gridHeight;
      const isFlatBedEdge =
        componentWidth > 0.075 &&
        componentHeight < 0.04 &&
        centerY > 0.54;
      const isPrintedRegion =
        centerX > 0.36 &&
        centerX < 0.66 &&
        centerY > 0.28 &&
        centerY < 0.66 &&
        bottom < 0.72 &&
        !isFlatBedEdge;
      const nozzleDistance =
        Math.abs(centerX - 0.535) * 2.8 +
        Math.abs(centerY - 0.43) * 2.2;
      const score =
        component.length *
          (componentWidth > 0.025 || componentHeight > 0.025 ? 1 : 0.45) -
        nozzleDistance * 1800;

      if (
        isPrintedRegion &&
        score > printedScore
      ) {
        printedComponent = component;
        printedScore = score;
      }
    }
  }

  if (!printedComponent.length) return [];
  const random = seededRandom(15485863);
  return Array.from({ length: count }, () => {
    return printedComponent[
      Math.floor(random() * printedComponent.length)
    ];
  });
}

function buildParticles(
  width: number,
  height: number,
  capturedFrame: CapturedFrame | null,
  sourceSamples: SourceSample[],
) {
  const count = width < 760 ? PARTICLES_MOBILE : PARTICLES_DESKTOP;
  const groupCount = Math.floor(count / 2);
  const random = seededRandom(982451653);
  const [temperatureCard, humidityCard] = getCards(width, height);
  const particles: Particle[] = [];
  const placement = capturedFrame
    ? getMediaPlacement(capturedFrame, width, height)
    : null;
  const shapeCenterX = width * 0.5;
  const shapeTop = height * 0.33;
  const shapeHeight = Math.min(height * 0.36, 325);
  const shapeWidth = Math.min(width * 0.3, 400);

  for (let index = 0; index < count; index += 1) {
    const group: 0 | 1 = index < groupCount ? 0 : 1;
    const localIndex = group === 0 ? index : index - groupCount;
    const vertical = random();
    const angle = random() * Math.PI * 2;
    const envelope =
      0.72 +
      Math.sin(vertical * Math.PI) * 0.28 -
      Math.max(0, vertical - 0.82) * 0.35;
    const twistedAngle = angle + vertical * 1.75;
    const sample = sourceSamples[index % Math.max(1, sourceSamples.length)];
    const target = chartTarget(
      group === 0 ? temperatureCard : humidityCard,
      group,
      localIndex,
      groupCount,
      random,
    );
    const qr = qrTarget(index, width, height, random);

    particles.push({
      group,
      sourceX:
        sample && placement
          ? placement.x + sample.x * placement.width
          : shapeCenterX +
            Math.cos(twistedAngle) * shapeWidth * envelope * 0.5,
      sourceY:
        sample && placement
          ? placement.y + sample.y * placement.height
          : shapeTop + vertical * shapeHeight + Math.sin(twistedAngle) * 7,
      targetX: target.x,
      targetY: target.y,
      qrX: qr.x,
      qrY: qr.y,
      curlX: (random() - 0.5) * Math.min(width * 0.16, 220),
      curlY:
        (group === 0 ? -1 : 1) *
        (0.18 + random() * 0.42) *
        Math.min(height * 0.2, 165),
      qrCurlX:
        (group === 0 ? -1 : 1) *
        (0.15 + random() * 0.5) *
        Math.min(width * 0.15, 210),
      qrCurlY: (random() - 0.5) * Math.min(height * 0.18, 150),
      ashAngle: random() * Math.PI * 2,
      ashSpread: (0.22 + random() * 0.78) * Math.min(width * 0.12, 150),
      ashSize: 0.55 + random() * 1.65,
      ashSpin: (random() - 0.5) * Math.PI * 2,
      delay: random() * 0.08,
      radius: 0.58 + random() * 0.72,
    });
  }

  return particles;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

function drawGrid(
  context: CanvasRenderingContext2D,
  card: ChartCard,
  alpha: number,
) {
  const left = card.x + card.width * 0.105;
  const right = card.x + card.width * 0.93;
  const top = card.y + card.height * 0.31;
  const bottom = card.y + card.height * 0.82;
  context.lineWidth = 1;
  context.strokeStyle = `rgba(93, 205, 236, ${0.12 * alpha})`;

  for (let line = 0; line <= 4; line += 1) {
    const y = lerp(top, bottom, line / 4);
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
  }

  for (let line = 0; line <= 6; line += 1) {
    const x = lerp(left, right, line / 6);
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
  }
}

function drawCard(
  context: CanvasRenderingContext2D,
  card: ChartCard,
  group: 0 | 1,
  alpha: number,
  width: number,
) {
  if (alpha <= 0) return;
  const accent = group === 0 ? RED : BLUE;
  const compact = width < 760;

  context.save();
  context.globalAlpha = alpha;
  context.shadowColor = "rgba(0, 0, 0, 0.42)";
  context.shadowBlur = 34;
  context.shadowOffsetY = 14;
  context.fillStyle = "rgba(10, 25, 35, 0.94)";
  roundedRect(context, card.x, card.y, card.width, card.height, 24);
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = "rgba(70, 215, 245, 0.22)";
  context.lineWidth = 1;
  context.stroke();

  const padding = card.width * 0.075;
  const titleY = card.y + card.height * 0.14;
  context.fillStyle = `rgb(${accent.join(",")})`;
  context.beginPath();
  context.arc(card.x + padding, titleY, compact ? 5 : 6, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#c8e7ef";
  context.font = `700 ${compact ? 11 : 12}px "DM Sans", sans-serif`;
  context.textBaseline = "middle";
  context.letterSpacing = "0.13em";
  context.fillText(
    group === 0 ? "TEMPERATURE" : "HUMIDITY",
    card.x + padding + 18,
    titleY,
  );

  context.textAlign = "right";
  context.fillStyle = "#f2fbff";
  context.font = `600 ${compact ? 20 : 26}px "Manrope", sans-serif`;
  context.letterSpacing = "0";
  context.fillText(
    group === 0 ? "21.6 °C" : "42.8 % RH",
    card.x + card.width - padding,
    titleY,
  );

  context.textAlign = "left";
  context.fillStyle = "rgba(161, 205, 218, 0.56)";
  context.font = `600 ${compact ? 8 : 9}px "DM Sans", sans-serif`;
  context.letterSpacing = "0.12em";
  context.fillText(
    "00:00",
    card.x + card.width * 0.105,
    card.y + card.height * 0.91,
  );
  context.textAlign = "right";
  context.fillText(
    "12:00",
    card.x + card.width * 0.93,
    card.y + card.height * 0.91,
  );
  context.textAlign = "left";

  drawGrid(context, card, alpha);
  context.restore();
}

function drawQrCard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha: number,
  transform?: {
    centerX: number;
    centerY: number;
    scale: number;
    rotation: number;
    perspectiveX: number;
    shear: number;
  },
) {
  if (alpha <= 0) return;
  const layout = getQrLayout(width, height);
  const cornerRadius = width < 760 ? 24 : 32;

  context.save();
  context.globalAlpha = alpha;
  if (transform) {
    context.translate(transform.centerX, transform.centerY);
    context.rotate(transform.rotation);
    context.transform(
      transform.scale * transform.perspectiveX,
      transform.scale * transform.shear,
      0,
      transform.scale,
      0,
      0,
    );
    context.translate(-width * 0.5, -height * 0.5);
  }
  if (transform) {
    const depth = 5 + (1 - transform.perspectiveX) * 18;
    context.fillStyle = "rgba(1, 7, 12, 0.94)";
    roundedRect(
      context,
      layout.cardX + depth,
      layout.cardY + depth * 0.58,
      layout.cardSize,
      layout.cardSize,
      cornerRadius,
    );
    context.fill();
  }
  context.shadowColor = "rgba(0, 212, 255, 0.18)";
  context.shadowBlur = width < 760 ? 28 : 48;
  context.shadowOffsetY = width < 760 ? 14 : 22;
  context.fillStyle = "rgba(8, 22, 31, 0.98)";
  roundedRect(
    context,
    layout.cardX,
    layout.cardY,
    layout.cardSize,
    layout.cardSize,
    cornerRadius,
  );
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = "rgba(77, 220, 247, 0.3)";
  context.lineWidth = 1;
  context.stroke();

  const inset = layout.cardPadding * 0.42;
  context.strokeStyle = "rgba(65, 211, 242, 0.18)";
  roundedRect(
    context,
    layout.cardX + inset,
    layout.cardY + inset,
    layout.cardSize - inset * 2,
    layout.cardSize - inset * 2,
    cornerRadius * 0.62,
  );
  context.stroke();

  context.fillStyle = "rgba(86, 230, 250, 0.88)";
  for (const [x, y] of [
    [layout.cardX + inset, layout.cardY + inset],
    [layout.cardX + layout.cardSize - inset, layout.cardY + inset],
    [layout.cardX + inset, layout.cardY + layout.cardSize - inset],
    [
      layout.cardX + layout.cardSize - inset,
      layout.cardY + layout.cardSize - inset,
    ],
  ]) {
    context.beginPath();
    context.arc(x, y, width < 760 ? 2.2 : 3, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function getIntegrationLayout(width: number, height: number) {
  const compact = width < 760;
  const partWidth = compact
    ? Math.min(width * 0.48, 230)
    : Math.min(width * 0.3, 430);
  const partHeight = compact
    ? Math.min(height * 0.25, 230)
    : Math.min(height * 0.32, 320);
  // Match the blue printed object in the captured Scene 01 frame. Scene 04
  // uses that exact frame instead of drawing a second, reconstructed object.
  const partCenterX = width * 0.5;
  const partBottomY = compact ? height * 0.74 : height * 0.73;

  return {
    compact,
    partWidth,
    partHeight,
    partCenterX,
    partBottomY,
    insertion: {
      x: partCenterX,
      // The module is installed at the first deposited layer at the base of
      // the blue print, rather than floating in the middle of the object.
      y: partBottomY - partHeight * 0.045,
    },
  };
}

function getModuleState(
  width: number,
  height: number,
  integrationProgress: number,
) {
  const dissolve = smoothstep(0.08, 0.42, integrationProgress);

  return {
    centerX: width * 0.5,
    centerY: width < 760 ? height * 0.5 : lerp(height * 0.5, height * 0.48, dissolve),
    scale: lerp(1, 0.94, dissolve),
    rotation: 0,
    perspectiveX: 1,
    shear: 0,
  };
}

function getPrintedPartDotTarget(
  particles: Particle[],
  width: number,
  height: number,
): Point {
  if (!particles.length) {
    return getIntegrationLayout(width, height).insertion;
  }

  let centerX = 0;
  let centerY = 0;
  for (const particle of particles) {
    centerX += particle.sourceX;
    centerY += particle.sourceY;
  }
  centerX /= particles.length;
  centerY /= particles.length;

  let target = particles[0];
  let targetDistance = Number.POSITIVE_INFINITY;
  for (const particle of particles) {
    const distance =
      (particle.sourceX - centerX) ** 2 +
      (particle.sourceY - centerY) ** 2;
    if (distance < targetDistance) {
      target = particle;
      targetDistance = distance;
    }
  }

  return {
    x: target.sourceX,
    y: target.sourceY,
  };
}

function getAshDotState(
  width: number,
  height: number,
  integrationProgress: number,
  target?: Point,
) {
  const layout = getIntegrationLayout(width, height);
  const finalTarget = target ?? layout.insertion;
  const gatherProgress = smoothstep(0.42, 0.66, integrationProgress);
  const transportProgress = smoothstep(0.66, 0.92, integrationProgress);
  const gatherX = width * 0.5;
  const gatherY = width < 760 ? height * 0.46 : height * 0.43;

  return {
    gatherProgress,
    transportProgress,
    x: lerp(gatherX, finalTarget.x, transportProgress),
    y:
      lerp(gatherY, finalTarget.y, transportProgress) -
      Math.sin(transportProgress * Math.PI) * height * 0.045,
  };
}

function drawDirectQrIntegration(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  integrationProgress: number,
  target?: Point,
) {
  if (integrationProgress <= 0) return;
  const layout = getIntegrationLayout(width, height);
  const insertion = target ?? layout.insertion;
  const glowAlpha = smoothstep(0.68, 0.9, integrationProgress);
  if (glowAlpha <= 0) return;

  context.save();
  context.globalAlpha = glowAlpha;
  const glow = context.createRadialGradient(
    insertion.x,
    insertion.y,
    0,
    insertion.x,
    insertion.y,
    layout.partWidth * 0.22,
  );
  glow.addColorStop(0, "rgba(75, 226, 247, 0.52)");
  glow.addColorStop(0.35, "rgba(64, 180, 255, 0.2)");
  glow.addColorStop(1, "rgba(64, 180, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(
    insertion.x - layout.partWidth * 0.25,
    insertion.y - layout.partWidth * 0.25,
    layout.partWidth * 0.5,
    layout.partWidth * 0.5,
  );
  context.restore();
}

function particlePosition(
  particle: Particle,
  sensorProgress: number,
  qrProgress: number,
  integrationProgress: number,
  width: number,
  height: number,
  dotTarget?: Point,
) {
  const travelProgress = smoothstep(
    0.16 + particle.delay,
    0.78 + particle.delay,
    sensorProgress,
  );
  const travelArc = Math.sin(travelProgress * Math.PI);
  const chartX =
    lerp(particle.sourceX, particle.targetX, travelProgress) +
    particle.curlX * travelArc;
  const chartY =
    lerp(particle.sourceY, particle.targetY, travelProgress) +
    particle.curlY * travelArc;
  const qrTravel = smoothstep(
    particle.delay * 0.4,
    0.82 + particle.delay * 0.4,
    qrProgress,
  );
  const qrArc = Math.sin(qrTravel * Math.PI);
  const qrX =
    lerp(chartX, particle.qrX, qrTravel) +
    particle.qrCurlX * qrArc;
  const qrY =
    lerp(chartY, particle.qrY, qrTravel) +
    particle.qrCurlY * qrArc;
  const moduleState = getModuleState(
    width,
    height,
    integrationProgress,
  );
  const qrCenterX = width * 0.5;
  const qrCenterY = height * 0.5;
  const localX =
    (qrX - qrCenterX) *
    moduleState.scale *
    moduleState.perspectiveX;
  const localY =
    (qrY - qrCenterY) * moduleState.scale +
    (qrX - qrCenterX) *
      moduleState.scale *
      moduleState.shear;
  const cosine = Math.cos(moduleState.rotation);
  const sine = Math.sin(moduleState.rotation);

  const transformedQrX =
    moduleState.centerX +
    localX * cosine -
    localY * sine;
  const transformedQrY =
    moduleState.centerY +
    localX * sine +
    localY * cosine;

  if (integrationProgress <= 0) {
    return {
      x: transformedQrX,
      y: transformedQrY,
    };
  }

  const ashRelease = smoothstep(
    0.08 + particle.delay * 0.45,
    0.44 + particle.delay * 0.45,
    integrationProgress,
  );
  const dotState = getAshDotState(width, height, integrationProgress, dotTarget);
  const ashGather = smoothstep(
    0.4 + particle.delay * 0.25,
    0.68,
    integrationProgress,
  );
  const ashFloat = Math.sin(ashRelease * Math.PI) * (1 - ashGather);
  const turbulence =
    Math.sin(
      integrationProgress * Math.PI * 7 +
        particle.ashSpin +
        particle.delay * 11,
    ) *
    Math.min(width * 0.018, 22);
  const ashX =
    transformedQrX +
    Math.cos(particle.ashAngle) * particle.ashSpread * ashRelease +
    turbulence;
  const ashY =
    transformedQrY +
    Math.sin(particle.ashAngle) * particle.ashSpread * 0.52 * ashRelease -
    ashFloat * Math.min(height * 0.11, 86);

  return {
    x: lerp(ashX, dotState.x, ashGather),
    y: lerp(ashY, dotState.y, ashGather),
  };
}

function drawCapturedFrame(
  context: CanvasRenderingContext2D,
  frame: CapturedFrame,
  width: number,
  height: number,
  alpha: number,
) {
  if (alpha <= 0) return;
  const placement = getMediaPlacement(frame, width, height);
  context.save();
  context.globalAlpha = alpha;

  if (height > width) {
    const backdrop = getMediaCoverPlacement(frame, width, height);
    context.save();
    context.filter = `blur(${Math.max(12, width * 0.045)}px) brightness(0.5) saturate(1.2)`;
    context.drawImage(
      frame.element,
      backdrop.x,
      backdrop.y,
      backdrop.width,
      backdrop.height,
    );
    context.restore();
    context.fillStyle = "rgba(3, 9, 15, 0.22)";
    context.fillRect(0, 0, width, height);
  }

  context.drawImage(
    frame.element,
    placement.x,
    placement.y,
    placement.width,
    placement.height,
  );
  context.restore();
}

function drawAshParticles(
  context: CanvasRenderingContext2D,
  particles: Particle[],
  sensorProgress: number,
  qrProgress: number,
  integrationProgress: number,
  width: number,
  height: number,
  alpha: number,
) {
  if (alpha <= 0.01) return;

  const dotTarget = getPrintedPartDotTarget(particles, width, height);
  const paleMix =
    0.3 +
    0.45 * smoothstep(0.16, 0.54, sensorProgress) +
    0.25 * smoothstep(0.12, 0.5, integrationProgress);
  const red = Math.round(lerp(ASH_BLUE[0], ASH_PALE[0], paleMix));
  const green = Math.round(lerp(ASH_BLUE[1], ASH_PALE[1], paleMix));
  const blue = Math.round(lerp(ASH_BLUE[2], ASH_PALE[2], paleMix));
  const sizeMultiplier =
    lerp(0.75, 1.35, smoothstep(0.08, 0.32, sensorProgress)) *
    (1 - smoothstep(0.88, 1, integrationProgress) * 0.42);
  const stride = Math.max(1, Math.ceil(particles.length / (width < 760 ? 820 : 1400)));
  const dotState = getAshDotState(
    width,
    height,
    integrationProgress,
    dotTarget,
  );
  const cloudAlpha =
    alpha * (1 - smoothstep(0.62, 0.76, integrationProgress));
  const singleDotAlpha =
    alpha *
    smoothstep(0.56, 0.72, integrationProgress) *
    (1 - smoothstep(0.94, 1, integrationProgress));

  context.save();
  context.globalCompositeOperation = "lighter";
  if (cloudAlpha > 0.01) {
    context.globalAlpha = cloudAlpha * 0.9;
    context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    context.beginPath();

    for (let index = 0; index < particles.length; index += stride) {
      const particle = particles[index];
      const position = particlePosition(
        particle,
        sensorProgress,
        qrProgress,
        integrationProgress,
        width,
        height,
        dotTarget,
      );
      const size = particle.ashSize * sizeMultiplier;
      context.rect(
        position.x - size * 0.5,
        position.y - size * 0.28,
        size,
        size * 0.56,
      );
    }
    context.fill();

    context.globalAlpha = cloudAlpha * 0.38;
    context.fillStyle = `rgb(${ASH_PALE.join(",")})`;
    context.beginPath();
    for (let index = 1; index < particles.length; index += stride * 3) {
      const particle = particles[index];
      const position = particlePosition(
        particle,
        sensorProgress,
        qrProgress,
        integrationProgress,
        width,
        height,
        dotTarget,
      );
      const size = particle.ashSize * sizeMultiplier * 1.45;
      context.rect(
        position.x - size * 0.5,
        position.y - size * 0.18,
        size,
        size * 0.36,
      );
    }
    context.fill();
  }

  if (singleDotAlpha > 0.01) {
    const radius =
      lerp(width < 760 ? 4.5 : 5.5, width < 760 ? 2.2 : 3.2, dotState.transportProgress);
    const glow = context.createRadialGradient(
      dotState.x,
      dotState.y,
      0,
      dotState.x,
      dotState.y,
      radius * 5.5,
    );
    glow.addColorStop(0, `rgba(${ASH_PALE.join(",")}, ${singleDotAlpha})`);
    glow.addColorStop(0.32, `rgba(${ASH_BLUE.join(",")}, ${singleDotAlpha * 0.55})`);
    glow.addColorStop(1, "rgba(88, 176, 255, 0)");
    context.globalAlpha = 1;
    context.fillStyle = glow;
    context.beginPath();
    context.arc(dotState.x, dotState.y, radius * 5.5, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = `rgba(${ASH_PALE.join(",")}, ${singleDotAlpha})`;
    context.beginPath();
    context.arc(dotState.x, dotState.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawScene(
  canvas: HTMLCanvasElement,
  particles: Particle[],
  progress: number,
  deviceScale: number,
  capturedFrame: CapturedFrame | null,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  context.clearRect(0, 0, width, height);

  // Before the first scroll input, leave the canvas transparent so the live
  // Blender print loop below it remains the exact image the visitor sees.
  if (!capturedFrame && progress < 0.5) return;
  const sensorProgress = clamp(progress / SENSOR_PHASE_END);
  const qrProgress = smoothstep(
    QR_PHASE_START,
    QR_PHASE_END,
    progress,
  );
  const integrationProgress = smoothstep(
    INTEGRATION_PHASE_START,
    INTEGRATION_PHASE_END,
    progress,
  );
  const moduleState = getModuleState(
    width,
    height,
    integrationProgress,
  );
  const printedPartDotTarget = getPrintedPartDotTarget(particles, width, height);

  const background = context.createRadialGradient(
    width * 0.5,
    height * 0.48,
    20,
    width * 0.5,
    height * 0.48,
    Math.max(width, height) * 0.7,
  );
  background.addColorStop(0, "#102b3a");
  background.addColorStop(0.48, "#081923");
  background.addColorStop(1, "#030a10");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  if (capturedFrame) {
    const openingFrameAlpha =
      1 - smoothstep(0.035, 0.22, sensorProgress);
    const returningFrameAlpha = smoothstep(
      0.02,
      0.2,
      integrationProgress,
    );
    drawCapturedFrame(
      context,
      capturedFrame,
      width,
      height,
      Math.max(openingFrameAlpha, returningFrameAlpha),
    );
  }

  const cardAlpha =
    smoothstep(0.53, 0.79, sensorProgress) *
    (1 - smoothstep(0.08, 0.58, qrProgress));
  const [temperatureCard, humidityCard] = getCards(width, height);
  drawCard(context, temperatureCard, 0, cardAlpha, width);
  drawCard(context, humidityCard, 1, cardAlpha, width);
  drawDirectQrIntegration(
    context,
    width,
    height,
    integrationProgress,
    printedPartDotTarget,
  );
  drawQrCard(
    context,
    width,
    height,
    smoothstep(0.24, 0.66, qrProgress) *
      (1 - smoothstep(0.08, 0.42, integrationProgress)),
    moduleState,
  );

  const sourceAlpha =
    smoothstep(0.04, 0.15, sensorProgress) *
    (1 - smoothstep(0.2, 0.43, sensorProgress));
  if (sourceAlpha > 0 && particles.length) {
    let sourceX = 0;
    let sourceY = 0;
    let minimumX = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;

    for (const particle of particles) {
      sourceX += particle.sourceX;
      sourceY += particle.sourceY;
      minimumX = Math.min(minimumX, particle.sourceX);
      maximumX = Math.max(maximumX, particle.sourceX);
      minimumY = Math.min(minimumY, particle.sourceY);
      maximumY = Math.max(maximumY, particle.sourceY);
    }

    context.save();
    context.globalAlpha = sourceAlpha * 0.16;
    context.fillStyle = "#36cde9";
    context.filter = "blur(7px)";
    context.beginPath();
    context.ellipse(
      sourceX / particles.length,
      sourceY / particles.length,
      clamp((maximumX - minimumX) * 0.42, 10, Math.min(width * 0.12, 130)),
      clamp((maximumY - minimumY) * 0.46, 7, 24),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();
  }

  const colorProgress = smoothstep(0.3, 0.68, sensorProgress);
  const qrColorProgress = smoothstep(0.42, 0.9, qrProgress);
  const particleAlpha =
    smoothstep(0.025, 0.14, sensorProgress) *
    (0.88 + smoothstep(0.68, 0.84, sensorProgress) * 0.12) *
    (1 - smoothstep(0.9, 1, integrationProgress));
  const openingAshAlpha =
    particleAlpha *
    (1 - smoothstep(0.44, 0.7, sensorProgress)) *
    (1 - smoothstep(0.05, 0.35, qrProgress));
  const qrAshAlpha =
    particleAlpha *
    smoothstep(0.08, 0.34, integrationProgress) *
    (1 - smoothstep(0.9, 1, integrationProgress));
  const dotAlpha =
    particleAlpha *
    smoothstep(0.32, 0.72, sensorProgress) *
    (1 - smoothstep(0.04, 0.22, integrationProgress));

  drawAshParticles(
    context,
    particles,
    sensorProgress,
    qrProgress,
    integrationProgress,
    width,
    height,
    Math.max(openingAshAlpha, qrAshAlpha),
  );

  for (const group of [0, 1] as const) {
    const targetColor = group === 0 ? RED : BLUE;
    const chartRed = lerp(BLUE[0], targetColor[0], colorProgress);
    const chartGreen = lerp(BLUE[1], targetColor[1], colorProgress);
    const chartBlue = lerp(BLUE[2], targetColor[2], colorProgress);
    const red = Math.round(
      lerp(chartRed, QR_DARK[0], qrColorProgress),
    );
    const green = Math.round(
      lerp(chartGreen, QR_DARK[1], qrColorProgress),
    );
    const blue = Math.round(
      lerp(chartBlue, QR_DARK[2], qrColorProgress),
    );
    if (dotAlpha <= 0.01) continue;
    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${dotAlpha})`;
    context.beginPath();

    for (const particle of particles) {
      if (particle.group !== group) continue;
      const position = particlePosition(
        particle,
        sensorProgress,
        qrProgress,
        integrationProgress,
        width,
        height,
      );
      context.moveTo(position.x + particle.radius, position.y);
      context.arc(
        position.x,
        position.y,
        particle.radius,
        0,
        Math.PI * 2,
      );
    }
    context.fill();
  }

  const headerAlpha =
    smoothstep(0.59, 0.82, sensorProgress) *
    (1 - smoothstep(0.05, 0.45, qrProgress));
  if (headerAlpha > 0) {
    context.save();
    context.globalAlpha = headerAlpha;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(168, 224, 238, 0.62)";
    context.font = '700 10px "DM Sans", sans-serif';
    context.letterSpacing = "0.18em";
    context.fillText(
      "LIVE MATERIAL TELEMETRY",
      width * 0.5,
      height * 0.15,
    );
    context.restore();
  }
}

export default function SensorTransformation() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const sectionNumberRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!section || !canvas || !video) return;
    const filmFrame = video.closest<HTMLElement>(".printing-film-frame");
    canvas.style.visibility = "hidden";

    let particles: Particle[] = [];
    let deviceScale = 1;
    let progress = 0;
    let animationFrame = 0;
    let capturedFrame: CapturedFrame | null = null;
    let sourceSamples: SourceSample[] = [];
    let cycleTimer: number | null = null;
    let playbackCheckTimer: number | null = null;
    let playbackWatchTimer: number | null = null;
    let fallbackFrameTimer: number | null = null;
    let initialScrollFrame = 0;
    let cycleTween: gsap.core.Tween | null = null;
    let cycleReturning = false;

    const requestLivePlayback = () => {
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      filmFrame?.classList.add("is-awaiting-playback");
      const startingTime = video.currentTime;
      void video.play().then(() => {
        if (playbackCheckTimer) window.clearTimeout(playbackCheckTimer);
        playbackCheckTimer = window.setTimeout(() => {
          playbackCheckTimer = null;
          filmFrame?.classList.toggle(
            "is-awaiting-playback",
            video.paused || video.currentTime <= startingTime + 0.05,
          );
        }, 700);
      }).catch(() => {
        filmFrame?.classList.add("is-awaiting-playback");
      });
    };

    const startLivePrint = () => {
      if (capturedFrame) return;
      requestLivePlayback();
    };

    const render = () => {
      animationFrame = 0;
      drawScene(
        canvas,
        particles,
        progress,
        deviceScale,
        capturedFrame,
      );
    };

    const scheduleRender = () => {
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      deviceScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * deviceScale));
      canvas.height = Math.max(1, Math.round(height * deviceScale));
      particles = buildParticles(
        width,
        height,
        capturedFrame,
        sourceSamples,
      );
      scheduleRender();
    };

    resize();

    const captureLivePrint = () => {
      if (
        capturedFrame ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        return;
      }

      const snapshot = document.createElement("canvas");
      snapshot.width = video.videoWidth;
      snapshot.height = video.videoHeight;
      const snapshotContext = snapshot.getContext("2d", {
        willReadFrequently: true,
      });
      if (!snapshotContext) return;

      snapshotContext.drawImage(
        video,
        0,
        0,
        snapshot.width,
        snapshot.height,
      );
      capturedFrame = {
        element: snapshot,
        width: snapshot.width,
        height: snapshot.height,
      };
      canvas.style.visibility = "visible";
      sourceSamples = extractPartSamples(snapshot, PARTICLES_DESKTOP);
      video.pause();
      resize();
    };

    const resetToLivePrint = () => {
      canvas.style.visibility = "hidden";
      if (!capturedFrame) {
        startLivePrint();
        return;
      }
      capturedFrame = null;
      sourceSamples = [];
      particles = buildParticles(
        canvas.clientWidth,
        canvas.clientHeight,
        null,
        sourceSamples,
      );
      startLivePrint();
      scheduleRender();
    };

    const updateInterface = () => {
      if (cueRef.current) {
        cueRef.current.style.opacity = String(
          1 - smoothstep(0.005, 0.08, progress),
        );
      }
      if (sectionNumberRef.current) {
        sectionNumberRef.current.textContent =
          progress < 0.22
            ? "01"
            : progress < 0.385
              ? "02"
              : progress < 0.67
                ? "03"
                : "01";
      }
    };

    const updateCycle = () => {
      if (progress >= 0.997 && !cycleTimer && !cycleReturning) {
        cycleTimer = window.setTimeout(() => {
          cycleTimer = null;
          cycleReturning = true;
          video.currentTime = 0;
          requestLivePlayback();
          cycleTween = gsap.to(canvas, {
            opacity: 0,
            duration: 1.1,
            ease: "power2.inOut",
            onComplete: () => {
              cycleTween = null;
              progress = 0;
              window.scrollTo({ top: 0, behavior: "auto" });
              resetToLivePrint();
              updateInterface();
              scheduleRender();
              gsap.set(canvas, { opacity: 1 });
              ScrollTrigger.update();
              cycleReturning = false;
            },
          });
        }, 900);
      } else if (progress < 0.97) {
        if (cycleTimer) {
          window.clearTimeout(cycleTimer);
          cycleTimer = null;
        }
        if (cycleTween) {
          cycleTween.kill();
          cycleTween = null;
          gsap.set(canvas, { opacity: 1 });
          cycleReturning = false;
        }
      }
      if (progress <= 0.006) cycleReturning = false;
    };

    const onVideoReady = () => {
      startLivePrint();
      if (progress > 0.018) captureLivePrint();
    };
    const onVideoPlaying = () => {
      filmFrame?.classList.remove("is-awaiting-playback");
    };
    const onVideoFrameReady = () => {
      if (video.currentTime > 0.02) {
        filmFrame?.classList.add("is-video-ready");
      }
    };
    video.addEventListener("loadeddata", onVideoReady);
    video.addEventListener("canplay", startLivePrint);
    video.addEventListener("playing", onVideoPlaying);
    video.addEventListener("timeupdate", onVideoFrameReady);

    const onPageShow = () => startLivePrint();
    const onFirstInteraction = () => startLivePrint();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !capturedFrame) {
        startLivePrint();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pointerdown", onFirstInteraction, { passive: true });
    window.addEventListener("touchstart", onFirstInteraction, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, behavior: "auto" });
    initialScrollFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      ScrollTrigger.refresh();
      startLivePrint();
    });

    let lastPlaybackTime = video.currentTime;
    playbackWatchTimer = window.setInterval(() => {
      if (capturedFrame || progress > 0.006 || document.visibilityState !== "visible") {
        lastPlaybackTime = video.currentTime;
        return;
      }
      const isAdvancing = !video.paused && video.currentTime > lastPlaybackTime + 0.02;
      filmFrame?.classList.toggle("is-awaiting-playback", !isAdvancing);
      if (!isAdvancing) startLivePrint();
      lastPlaybackTime = video.currentTime;
    }, 900);

    fallbackFrameTimer = window.setInterval(() => {
      if (
        capturedFrame ||
        progress > 0.006 ||
        !video.paused ||
        !filmFrame?.classList.contains("is-awaiting-playback") ||
        video.readyState < HTMLMediaElement.HAVE_METADATA ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      ) {
        return;
      }
      video.currentTime = (video.currentTime + 0.12) % video.duration;
    }, 120);
    startLivePrint();

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const trigger = reducedMotion
      ? null
      : ScrollTrigger.create({
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            progress = self.progress;
            if (progress > 0.018) {
              captureLivePrint();
            } else if (progress <= 0.006) {
              resetToLivePrint();
            }
            updateInterface();
            updateCycle();
            scheduleRender();
          },
        });

    if (reducedMotion) {
      progress = 1;
      updateInterface();
      scheduleRender();
    }

    window.addEventListener("resize", resize);
    return () => {
      trigger?.kill();
      video.removeEventListener("loadeddata", onVideoReady);
      video.removeEventListener("canplay", startLivePrint);
      video.removeEventListener("playing", onVideoPlaying);
      video.removeEventListener("timeupdate", onVideoFrameReady);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("touchstart", onFirstInteraction);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", resize);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (cycleTimer) window.clearTimeout(cycleTimer);
      if (playbackCheckTimer) window.clearTimeout(playbackCheckTimer);
      if (playbackWatchTimer) window.clearInterval(playbackWatchTimer);
      if (fallbackFrameTimer) window.clearInterval(fallbackFrameTimer);
      if (initialScrollFrame) window.cancelAnimationFrame(initialScrollFrame);
      cycleTween?.kill();
      window.history.scrollRestoration = previousScrollRestoration;
      gsap.set(canvas, { clearProps: "opacity" });
      canvas.style.visibility = "";
      filmFrame?.classList.remove("is-awaiting-playback");
      filmFrame?.classList.remove("is-video-ready");
      void video.play().catch(() => undefined);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="sensor-story"
      id="top"
      aria-label="The live 3D printing scene transforming into sensor diagrams and a QR module that embeds itself in the printed part"
    >
      <div className="sensor-stage">
        <PrintingExperience ref={videoRef} />
        <canvas
          ref={canvasRef}
          className="sensor-canvas"
          role="img"
          aria-label="The printed material becomes sensor diagrams and a QR module that flies into the printed part"
        />
        <div ref={cueRef} className="scroll-cue" aria-hidden="true">
          <span />
        </div>
        <div className="sensor-section-mark" aria-hidden="true">
          <span ref={sectionNumberRef}>01</span>
          <i />
        </div>
      </div>
      <span className="sensor-end-anchor" id="sensors-end" aria-hidden="true" />
    </section>
  );
}
