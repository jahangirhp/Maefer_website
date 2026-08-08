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
  delay: number;
  radius: number;
};

type SourceSample = {
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
const QR_DARK = [22, 48, 62] as const;
const PARTICLES_DESKTOP = 1400;
const PARTICLES_MOBILE = 800;
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

function getCoverPlacement(
  frame: CapturedFrame,
  width: number,
  height: number,
) {
  const scale = Math.max(width / frame.width, height / frame.height);
  const renderedWidth = frame.width * scale;
  const renderedHeight = frame.height * scale;

  return {
    x: (width - renderedWidth) * 0.5,
    y: (height - renderedHeight) * 0.52,
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

  // The printed path is the largest connected blue object near the center and
  // lower part of the live frame. Connected-component selection excludes the
  // blue nozzle face and the thin blue guide lines on the bed.
  const queueX = new Int32Array(mask.length);
  const queueY = new Int32Array(mask.length);
  let printedComponent: SourceSample[] = [];
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
      const bottom = maximumY / gridHeight;
      const componentWidth = (maximumX - minimumX) / gridWidth;
      const isCentralPrintedPath =
        centerX > 0.38 &&
        centerX < 0.62 &&
        bottom > 0.64 &&
        componentWidth > 0.035;

      if (
        isCentralPrintedPath &&
        component.length > printedComponent.length
      ) {
        printedComponent = component;
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
    ? getCoverPlacement(capturedFrame, width, height)
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
      delay: random() * 0.08,
      radius: 1.15 + random() * 1.35,
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
  context.strokeStyle = `rgba(30, 48, 65, ${0.09 * alpha})`;

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
  context.shadowColor = "rgba(30, 50, 65, 0.10)";
  context.shadowBlur = 34;
  context.shadowOffsetY = 14;
  context.fillStyle = "rgba(255, 255, 255, 0.94)";
  roundedRect(context, card.x, card.y, card.width, card.height, 24);
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = "rgba(26, 52, 72, 0.12)";
  context.lineWidth = 1;
  context.stroke();

  const padding = card.width * 0.075;
  const titleY = card.y + card.height * 0.14;
  context.fillStyle = `rgb(${accent.join(",")})`;
  context.beginPath();
  context.arc(card.x + padding, titleY, compact ? 5 : 6, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#243440";
  context.font = `700 ${compact ? 11 : 12}px "DM Sans", sans-serif`;
  context.textBaseline = "middle";
  context.letterSpacing = "0.13em";
  context.fillText(
    group === 0 ? "TEMPERATURE" : "HUMIDITY",
    card.x + padding + 18,
    titleY,
  );

  context.textAlign = "right";
  context.fillStyle = "#14232c";
  context.font = `600 ${compact ? 20 : 26}px "Manrope", sans-serif`;
  context.letterSpacing = "0";
  context.fillText(
    group === 0 ? "214.6 °C" : "42.8 % RH",
    card.x + card.width - padding,
    titleY,
  );

  context.textAlign = "left";
  context.fillStyle = "rgba(37, 57, 70, 0.48)";
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
    context.fillStyle = "rgba(184, 198, 205, 0.9)";
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
  context.shadowColor = "rgba(21, 43, 58, 0.15)";
  context.shadowBlur = width < 760 ? 28 : 48;
  context.shadowOffsetY = width < 760 ? 14 : 22;
  context.fillStyle = "rgba(255, 255, 255, 0.97)";
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
  context.strokeStyle = "rgba(31, 60, 75, 0.14)";
  context.lineWidth = 1;
  context.stroke();

  const inset = layout.cardPadding * 0.42;
  context.strokeStyle = "rgba(28, 111, 246, 0.08)";
  roundedRect(
    context,
    layout.cardX + inset,
    layout.cardY + inset,
    layout.cardSize - inset * 2,
    layout.cardSize - inset * 2,
    cornerRadius * 0.62,
  );
  context.stroke();

  context.fillStyle = "rgba(104, 226, 158, 0.72)";
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

type Point = {
  x: number;
  y: number;
};

function getIntegrationLayout(width: number, height: number) {
  const compact = width < 760;
  const partWidth = compact
    ? Math.min(width * 0.58, 250)
    : Math.min(width * 0.23, 390);
  const partHeight = compact
    ? Math.min(height * 0.28, 250)
    : Math.min(height * 0.38, 350);
  const partCenterX = compact ? width * 0.62 : width * 0.72;
  const partBottomY = compact ? height * 0.77 : height * 0.74;

  return {
    compact,
    partWidth,
    partHeight,
    partCenterX,
    partBottomY,
    insertion: {
      x: partCenterX,
      y: partBottomY - partHeight * 0.64,
    },
    armBase: {
      x: compact ? width * 0.18 : width * 0.3,
      y: compact ? height * 0.84 : height * 0.82,
    },
  };
}

function getModuleState(
  width: number,
  height: number,
  integrationProgress: number,
) {
  const integration = getIntegrationLayout(width, height);
  const transport = smoothstep(0.16, 0.76, integrationProgress);
  const scale = lerp(
    1,
    integration.compact ? 0.18 : 0.14,
    smoothstep(0.035, 0.34, integrationProgress),
  );
  const turn = smoothstep(0.025, 0.3, integrationProgress);

  return {
    centerX: lerp(width * 0.5, integration.insertion.x, transport),
    centerY:
      lerp(height * 0.5, integration.insertion.y, transport) -
      Math.sin(transport * Math.PI) * height * 0.12,
    scale,
    rotation: lerp(0, -0.11, turn),
    perspectiveX: lerp(1, 0.58, turn),
    shear: lerp(0, 0.15, turn),
  };
}

function drawFinalPrintedPart(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha: number,
) {
  if (alpha <= 0) return;
  const layout = getIntegrationLayout(width, height);
  const layers = layout.compact ? 24 : 32;

  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = "rgba(27, 59, 82, 0.13)";
  context.filter = "blur(10px)";
  context.beginPath();
  context.ellipse(
    layout.partCenterX,
    layout.partBottomY + 8,
    layout.partWidth * 0.48,
    14,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.filter = "none";
  context.lineCap = "round";

  for (let layer = 0; layer < layers; layer += 1) {
    const vertical = layer / Math.max(1, layers - 1);
    const envelope =
      0.78 +
      Math.sin(vertical * Math.PI) * 0.24 -
      Math.max(0, vertical - 0.82) * 0.44;
    const y =
      layout.partBottomY - vertical * layout.partHeight;
    const centerShift =
      Math.sin(vertical * Math.PI * 2.15) *
      layout.partWidth *
      0.025;
    const halfWidth = layout.partWidth * 0.5 * envelope;
    const layerDepth =
      layout.partHeight * (0.026 + vertical * 0.008);
    const gradient = context.createLinearGradient(
      layout.partCenterX - halfWidth,
      y,
      layout.partCenterX + halfWidth,
      y,
    );
    gradient.addColorStop(0, "rgba(17, 85, 215, 0.68)");
    gradient.addColorStop(0.48, "rgba(65, 139, 255, 0.96)");
    gradient.addColorStop(1, "rgba(18, 93, 226, 0.72)");
    context.strokeStyle = gradient;
    context.lineWidth = layout.compact ? 2.1 : 2.7;
    context.beginPath();
    for (let point = 0; point <= 72; point += 1) {
      const angle = (point / 72) * Math.PI * 2;
      const radius =
        1 +
        Math.cos(angle * 3 + vertical * 1.7) * 0.13 +
        Math.cos(angle * 6 - vertical * 0.8) * 0.025;
      const pointX =
        layout.partCenterX +
        centerShift +
        Math.cos(angle) * halfWidth * radius;
      const pointY =
        y + Math.sin(angle) * layerDepth * radius;
      if (point === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.closePath();
    context.stroke();
  }
  context.restore();
}

function solveArm(
  base: Point,
  target: Point,
  firstLength: number,
  secondLength: number,
) {
  const deltaX = target.x - base.x;
  const deltaY = target.y - base.y;
  const distance = Math.max(
    1,
    Math.min(
      Math.hypot(deltaX, deltaY),
      firstLength + secondLength - 1,
    ),
  );
  const direction = Math.atan2(deltaY, deltaX);
  const shoulderOffset = Math.acos(
    clamp(
      (firstLength * firstLength +
        distance * distance -
        secondLength * secondLength) /
        (2 * firstLength * distance),
      -1,
      1,
    ),
  );
  const shoulderAngle = direction - shoulderOffset;
  const elbow = {
    x: base.x + Math.cos(shoulderAngle) * firstLength,
    y: base.y + Math.sin(shoulderAngle) * firstLength,
  };

  return { elbow };
}

function drawArmLink(
  context: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  compact: boolean,
  widthScale = 1,
) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const startHalfWidth = (compact ? 24 : 35) * widthScale;
  const endHalfWidth = startHalfWidth * 0.76;

  context.save();
  context.translate(start.x, start.y);
  context.rotate(angle);
  const surface = context.createLinearGradient(
    0,
    -startHalfWidth,
    0,
    startHalfWidth,
  );
  surface.addColorStop(0, "#ffffff");
  surface.addColorStop(0.58, "#f8faf9");
  surface.addColorStop(1, "#e9eff0");
  context.fillStyle = surface;
  context.strokeStyle = "#c5d0d4";
  context.lineWidth = compact ? 2.5 : 3.5;
  context.beginPath();
  context.moveTo(0, -startHalfWidth);
  context.bezierCurveTo(
    length * 0.28,
    -startHalfWidth * 1.06,
    length * 0.73,
    -endHalfWidth * 0.88,
    length,
    -endHalfWidth,
  );
  context.quadraticCurveTo(
    length + endHalfWidth * 0.42,
    0,
    length,
    endHalfWidth,
  );
  context.bezierCurveTo(
    length * 0.7,
    endHalfWidth * 0.9,
    length * 0.3,
    startHalfWidth * 0.93,
    0,
    startHalfWidth,
  );
  context.quadraticCurveTo(-startHalfWidth * 0.42, 0, 0, -startHalfWidth);
  context.closePath();
  context.fill();
  context.stroke();

  context.strokeStyle = "rgba(134, 205, 205, 0.58)";
  context.lineWidth = compact ? 1.5 : 2;
  context.beginPath();
  context.moveTo(length * 0.14, 0);
  context.lineTo(length * 0.86, 0);
  context.stroke();
  context.restore();
}

function drawSculptedPedestal(
  context: CanvasRenderingContext2D,
  base: Point,
  shoulder: Point,
  compact: boolean,
) {
  const length = Math.hypot(
    shoulder.x - base.x,
    shoulder.y - base.y,
  );
  const angle = Math.atan2(
    shoulder.y - base.y,
    shoulder.x - base.x,
  );
  const baseWidth = compact ? 34 : 50;
  const shoulderWidth = compact ? 23 : 35;

  context.save();
  context.translate(base.x, base.y);
  context.rotate(angle);
  const surface = context.createLinearGradient(
    0,
    -baseWidth,
    0,
    baseWidth,
  );
  surface.addColorStop(0, "#ffffff");
  surface.addColorStop(0.55, "#f8faf9");
  surface.addColorStop(1, "#e5ecee");
  context.fillStyle = surface;
  context.strokeStyle = "#c5d0d4";
  context.lineWidth = compact ? 2.5 : 3.5;
  context.beginPath();
  context.moveTo(0, -baseWidth);
  context.bezierCurveTo(
    length * 0.25,
    -baseWidth * 1.08,
    length * 0.54,
    -shoulderWidth * 0.62,
    length,
    -shoulderWidth,
  );
  context.quadraticCurveTo(
    length + shoulderWidth * 0.48,
    0,
    length,
    shoulderWidth,
  );
  context.bezierCurveTo(
    length * 0.6,
    shoulderWidth * 0.72,
    length * 0.34,
    baseWidth * 1.1,
    0,
    baseWidth,
  );
  context.quadraticCurveTo(-baseWidth * 0.35, 0, 0, -baseWidth);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawIndustrialJoint(
  context: CanvasRenderingContext2D,
  point: Point,
  compact: boolean,
  scale = 1,
) {
  const outerRadius = (compact ? 28 : 42) * scale;
  context.fillStyle = "#f8f9f9";
  context.strokeStyle = "#c8d4d8";
  context.lineWidth = compact ? 3 : 4;
  context.beginPath();
  context.arc(point.x, point.y, outerRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#a7d4d2";
  context.beginPath();
  context.arc(
    point.x,
    point.y,
    outerRadius * 0.46,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.strokeStyle = "rgba(83, 149, 153, 0.42)";
  context.lineWidth = compact ? 1.5 : 2;
  context.stroke();
  context.fillStyle = "rgba(255, 255, 255, 0.5)";
  context.beginPath();
  context.arc(
    point.x - outerRadius * 0.14,
    point.y - outerRadius * 0.16,
    outerRadius * 0.13,
    0,
    Math.PI * 2,
  );
  context.fill();
}

function drawIndustrialBase(
  context: CanvasRenderingContext2D,
  base: Point,
  compact: boolean,
) {
  const width = compact ? 112 : 174;
  const height = compact ? 40 : 57;
  context.fillStyle = "rgba(29, 49, 61, 0.12)";
  context.beginPath();
  context.ellipse(
    base.x,
    base.y + height * 0.66,
    width * 0.58,
    height * 0.32,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.fillStyle = "#d1dadd";
  context.beginPath();
  context.ellipse(
    base.x,
    base.y + height * 0.3,
    width * 0.52,
    height * 0.42,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.fillStyle = "#f9faf9";
  context.fillRect(
    base.x - width * 0.5,
    base.y - height * 0.1,
    width,
    height * 0.42,
  );
  context.beginPath();
  context.ellipse(
    base.x,
    base.y - height * 0.1,
    width * 0.5,
    height * 0.38,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.strokeStyle = "#99cccb";
  context.lineWidth = compact ? 2 : 3;
  context.beginPath();
  context.ellipse(
    base.x,
    base.y + height * 0.3,
    width * 0.5,
    height * 0.38,
    0,
    0,
    Math.PI,
  );
  context.stroke();
}

function drawIndustrialGripper(
  context: CanvasRenderingContext2D,
  target: Point,
  wristAngle: number,
  compact: boolean,
  moduleHalfHeight: number,
  integrationProgress: number,
) {
  const release = smoothstep(0.82, 0.96, integrationProgress);
  const jawGap =
    Math.min(
      moduleHalfHeight + (compact ? 5 : 8),
      compact ? 34 : 48,
    ) +
    release * (compact ? 13 : 18);
  const fingerLength = compact ? 34 : 50;

  context.save();
  context.translate(target.x, target.y);
  context.rotate(wristAngle);
  context.fillStyle = "#f8f9f9";
  context.strokeStyle = "#c6d2d6";
  context.lineWidth = compact ? 2.5 : 3.5;
  roundedRect(
    context,
    -(compact ? 18 : 27),
    -(compact ? 18 : 26),
    compact ? 39 : 56,
    compact ? 36 : 52,
    compact ? 10 : 14,
  );
  context.fill();
  context.stroke();

  context.fillStyle = "#a7d4d2";
  context.beginPath();
  context.arc(0, 0, compact ? 9 : 13, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#75878e";
  context.lineCap = "round";
  context.lineWidth = compact ? 7 : 10;
  for (const direction of [-1, 1]) {
    context.beginPath();
    context.moveTo(compact ? 14 : 20, direction * jawGap * 0.52);
    context.lineTo(
      (compact ? 14 : 20) + fingerLength,
      direction * jawGap,
    );
    context.stroke();
    context.strokeStyle = "#f8f9f9";
    context.lineWidth = compact ? 5 : 7;
    context.stroke();
    context.strokeStyle = "#75878e";
    context.lineWidth = compact ? 7 : 10;
  }
  context.restore();
}

function drawFinalPrintNozzle(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  integrationProgress: number,
  alpha: number,
) {
  if (alpha <= 0) return;
  const layout = getIntegrationLayout(width, height);
  const scale = layout.compact ? 0.72 : 1;
  const partTop = layout.partBottomY - layout.partHeight;
  const printMotion = smoothstep(0.16, 0.92, integrationProgress);
  const headX =
    layout.partCenterX +
    Math.sin(printMotion * Math.PI * 2.2) *
      layout.partWidth *
      0.14;
  const tipY = partTop - 1;

  context.save();
  context.globalAlpha = alpha;
  context.translate(headX, tipY);
  context.scale(scale, scale);
  context.shadowColor = "rgba(25, 44, 56, 0.16)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 8;
  context.fillStyle = "#47545c";
  roundedRect(context, -39, -112, 78, 58, 13);
  context.fill();
  context.shadowColor = "transparent";
  context.fillStyle = "#e9eef0";
  roundedRect(context, -31, -50, 62, 29, 7);
  context.fill();
  context.fillStyle = "#24333d";
  roundedRect(context, -34, -29, 68, 14, 5);
  context.fill();
  context.fillStyle = "#4b91eb";
  roundedRect(context, -30, -104, 60, 39, 8);
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.68)";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#eca24b";
  context.beginPath();
  context.moveTo(-12, -14);
  context.lineTo(12, -14);
  context.lineTo(5, 0);
  context.lineTo(-5, 0);
  context.closePath();
  context.fill();
  context.restore();
}

function drawRoboticIntegration(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  integrationProgress: number,
  moduleState: ReturnType<typeof getModuleState>,
) {
  if (integrationProgress <= 0) return;
  const layout = getIntegrationLayout(width, height);
  const partAlpha = smoothstep(0.1, 0.38, integrationProgress);
  drawFinalPrintedPart(context, width, height, partAlpha);
  drawFinalPrintNozzle(
    context,
    width,
    height,
    integrationProgress,
    smoothstep(0.13, 0.36, integrationProgress),
  );

  const armAlpha = smoothstep(0.12, 0.29, integrationProgress);
  if (armAlpha <= 0) return;
  const qrLayout = getQrLayout(width, height);
  const moduleHalfWidth =
    qrLayout.cardSize *
    moduleState.scale *
    moduleState.perspectiveX *
    0.5;
  const moduleHalfHeight =
    qrLayout.cardSize * moduleState.scale * 0.5;
  const retract = smoothstep(0.82, 1, integrationProgress);
  const entry = smoothstep(0.1, 0.3, integrationProgress);
  const base = {
    x: lerp(
      -(layout.compact ? width * 0.22 : width * 0.12),
      layout.armBase.x,
      entry,
    ),
    y: layout.armBase.y,
  };
  const shoulder = {
    x: base.x + (layout.compact ? 34 : 52),
    y: base.y - (layout.compact ? 112 : 168),
  };
  const gripperTarget = {
    x: lerp(
      moduleState.centerX - moduleHalfWidth,
      layout.insertion.x - layout.partWidth * 0.38,
      retract,
    ),
    y: lerp(
      moduleState.centerY,
      layout.insertion.y - layout.partHeight * 0.36,
      retract,
    ),
  };
  const startDistance = Math.hypot(
    width * 0.5 - shoulder.x,
    height * 0.5 - shoulder.y,
  );
  const endDistance = Math.hypot(
    layout.insertion.x - shoulder.x,
    layout.insertion.y - shoulder.y,
  );
  const reach = Math.max(startDistance, endDistance) * 1.035;
  const firstLength = reach * 0.47;
  const secondLength = reach * 0.58;
  const { elbow } = solveArm(
    shoulder,
    gripperTarget,
    firstLength,
    secondLength,
  );

  context.save();
  context.globalAlpha = armAlpha;
  context.shadowColor = "rgba(31, 52, 65, 0.12)";
  context.shadowBlur = layout.compact ? 18 : 30;
  context.shadowOffsetY = 12;
  drawIndustrialBase(context, base, layout.compact);
  drawSculptedPedestal(context, base, shoulder, layout.compact);
  drawArmLink(context, shoulder, elbow, layout.compact, 1);
  drawArmLink(
    context,
    elbow,
    gripperTarget,
    layout.compact,
    0.76,
  );
  context.shadowColor = "transparent";
  drawIndustrialJoint(context, shoulder, layout.compact, 1.04);
  drawIndustrialJoint(context, elbow, layout.compact, 0.88);

  const wristAngle = Math.atan2(
    gripperTarget.y - elbow.y,
    gripperTarget.x - elbow.x,
  );
  drawIndustrialGripper(
    context,
    gripperTarget,
    wristAngle,
    layout.compact,
    moduleHalfHeight,
    integrationProgress,
  );
  context.restore();

  const glowAlpha = smoothstep(0.72, 0.9, integrationProgress);
  if (glowAlpha > 0) {
    context.save();
    context.globalAlpha = glowAlpha;
    const glow = context.createRadialGradient(
      layout.insertion.x,
      layout.insertion.y,
      0,
      layout.insertion.x,
      layout.insertion.y,
      layout.partWidth * 0.22,
    );
    glow.addColorStop(0, "rgba(104, 226, 158, 0.42)");
    glow.addColorStop(1, "rgba(104, 226, 158, 0)");
    context.fillStyle = glow;
    context.fillRect(
      layout.insertion.x - layout.partWidth * 0.25,
      layout.insertion.y - layout.partWidth * 0.25,
      layout.partWidth * 0.5,
      layout.partWidth * 0.5,
    );
    context.restore();
  }
}

function particlePosition(
  particle: Particle,
  sensorProgress: number,
  qrProgress: number,
  integrationProgress: number,
  width: number,
  height: number,
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

  return {
    x:
      moduleState.centerX +
      localX * cosine -
      localY * sine,
    y:
      moduleState.centerY +
      localX * sine +
      localY * cosine,
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
  const placement = getCoverPlacement(frame, width, height);
  context.save();
  context.globalAlpha = alpha;
  context.drawImage(
    frame.element,
    placement.x,
    placement.y,
    placement.width,
    placement.height,
  );
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

  const background = context.createRadialGradient(
    width * 0.5,
    height * 0.48,
    20,
    width * 0.5,
    height * 0.48,
    Math.max(width, height) * 0.7,
  );
  background.addColorStop(0, "#ffffff");
  background.addColorStop(1, "#f5f8fa");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  if (capturedFrame) {
    drawCapturedFrame(
      context,
      capturedFrame,
      width,
      height,
      1 - smoothstep(0.035, 0.22, sensorProgress),
    );
  }

  const cardAlpha =
    smoothstep(0.53, 0.79, sensorProgress) *
    (1 - smoothstep(0.08, 0.58, qrProgress));
  const [temperatureCard, humidityCard] = getCards(width, height);
  drawCard(context, temperatureCard, 0, cardAlpha, width);
  drawCard(context, humidityCard, 1, cardAlpha, width);
  drawRoboticIntegration(
    context,
    width,
    height,
    integrationProgress,
    moduleState,
  );
  drawQrCard(
    context,
    width,
    height,
    smoothstep(0.24, 0.66, qrProgress) *
      (1 - smoothstep(0.84, 0.98, integrationProgress)),
    moduleState,
  );

  const sourceAlpha =
    smoothstep(0.04, 0.15, sensorProgress) *
    (1 - smoothstep(0.2, 0.43, sensorProgress));
  if (sourceAlpha > 0) {
    context.save();
    context.globalAlpha = sourceAlpha * 0.16;
    context.fillStyle = "#27445a";
    context.filter = "blur(11px)";
    context.beginPath();
    context.ellipse(
      width * 0.5,
      height * 0.71,
      Math.min(width * 0.14, 190),
      18,
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
    (1 - smoothstep(0.84, 0.98, integrationProgress) * 0.78);

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
    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${particleAlpha})`;
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
    context.fillStyle = "rgba(24, 44, 58, 0.46)";
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

    let particles: Particle[] = [];
    let deviceScale = 1;
    let progress = 0;
    let animationFrame = 0;
    let capturedFrame: CapturedFrame | null = null;
    let sourceSamples: SourceSample[] = [];
    let cycleTimer: number | null = null;
    let cycleReturning = false;

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
      sourceSamples = extractPartSamples(snapshot, PARTICLES_DESKTOP);
      video.pause();
      resize();
    };

    const resetToLivePrint = () => {
      if (!capturedFrame) return;
      capturedFrame = null;
      sourceSamples = [];
      particles = buildParticles(
        canvas.clientWidth,
        canvas.clientHeight,
        null,
        sourceSamples,
      );
      void video.play().catch(() => undefined);
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
                : "04";
      }
    };

    const updateCycle = () => {
      if (progress >= 0.997 && !cycleTimer && !cycleReturning) {
        cycleTimer = window.setTimeout(() => {
          cycleTimer = null;
          cycleReturning = true;
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, 1500);
      } else if (progress < 0.97 && cycleTimer) {
        window.clearTimeout(cycleTimer);
        cycleTimer = null;
      }
      if (progress <= 0.006) cycleReturning = false;
    };

    const onVideoReady = () => {
      if (progress > 0.018) captureLivePrint();
    };
    video.addEventListener("loadeddata", onVideoReady);

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
      window.removeEventListener("resize", resize);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (cycleTimer) window.clearTimeout(cycleTimer);
      void video.play().catch(() => undefined);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="sensor-story"
      id="top"
      aria-label="The live 3D printing scene transforming into sensor diagrams, a QR code, and robotic part integration"
    >
      <div className="sensor-stage">
        <PrintingExperience ref={videoRef} />
        <canvas
          ref={canvasRef}
          className="sensor-canvas"
          role="img"
          aria-label="The printed material becomes sensor diagrams and a QR module that a robotic arm places inside the printed part"
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
