import { useEffect, useId, useMemo, useRef, useState } from "react";
import JSZip from "jszip";

type PrintMetadata = {
  job_uuid: string;
  file_name: string;
  start_time: string;
  end_time: string;
  sensor_sample_count: number;
  preview_available: boolean;
  export_generated_at: string;
};

type SensorSample = {
  time: string;
  timestamp: number;
  temperature: number;
  humidity: number;
  printStatus: string;
};

type PrintJob = {
  folder: string;
  metadata: PrintMetadata;
  samples: SensorSample[];
  previewUrl?: string;
};

type Metric = "temperature" | "humidity";

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_JOBS = 100;
const MAX_SAMPLES_PER_JOB = 200_000;

function parseCsv(text: string): SensorSample[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const index = (name: string) => headers.indexOf(name);
  const timeIndex = index("time");
  const temperatureIndex = index("temperature");
  const humidityIndex = index("humidity");
  const statusIndex = index("print_status");
  if (timeIndex < 0 || temperatureIndex < 0 || humidityIndex < 0) {
    throw new Error("sensor_data.csv has an unsupported header.");
  }
  if (lines.length - 1 > MAX_SAMPLES_PER_JOB) {
    throw new Error(`A print contains more than ${MAX_SAMPLES_PER_JOB.toLocaleString()} sensor samples.`);
  }

  return lines.slice(1).flatMap((line) => {
    const values = line.split(",");
    const time = String(values[timeIndex] || "").trim();
    const temperature = Number(values[temperatureIndex]);
    const humidity = Number(values[humidityIndex]);
    const timestamp = Date.parse(time);
    if (!time || !Number.isFinite(timestamp) || !Number.isFinite(temperature) || !Number.isFinite(humidity)) {
      return [];
    }
    return [{
      time,
      timestamp,
      temperature,
      humidity,
      printStatus: statusIndex >= 0 ? String(values[statusIndex] || "").trim() : "",
    }];
  });
}

function validMetadata(value: unknown): value is PrintMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<PrintMetadata>;
  return typeof metadata.job_uuid === "string" && typeof metadata.file_name === "string";
}

async function parsePrintArchive(file: File): Promise<PrintJob[]> {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Choose a ZIP export from Print History.");
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("The ZIP is larger than the 100 MB upload limit.");

  const archive = await JSZip.loadAsync(file);
  const metadataEntries = Object.values(archive.files).filter(
    (entry) => !entry.dir && /(^|\/)metadata\.json$/i.test(entry.name),
  );
  if (!metadataEntries.length) throw new Error("No print metadata was found in this ZIP.");
  if (metadataEntries.length > MAX_JOBS) throw new Error(`The ZIP contains more than ${MAX_JOBS} print jobs.`);

  const jobs = await Promise.all(metadataEntries.map(async (metadataEntry) => {
    const folder = metadataEntry.name.slice(0, -"metadata.json".length);
    const metadata = JSON.parse(await metadataEntry.async("text")) as unknown;
    if (!validMetadata(metadata)) throw new Error(`Invalid metadata in ${metadataEntry.name}.`);
    const csvEntry = archive.file(`${folder}sensor_data.csv`);
    if (!csvEntry) throw new Error(`Sensor data is missing for ${metadata.file_name || metadata.job_uuid}.`);
    const samples = parseCsv(await csvEntry.async("text"));
    if (!samples.length) throw new Error(`No valid sensor samples were found for ${metadata.file_name || metadata.job_uuid}.`);
    const previewEntry = archive.file(`${folder}preview.png`);
    const previewUrl = previewEntry
      ? URL.createObjectURL(await previewEntry.async("blob"))
      : undefined;
    return { folder, metadata, samples, previewUrl };
  }));

  return jobs.sort((a, b) => Date.parse(b.metadata.end_time) - Date.parse(a.metadata.end_time));
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(start: string, end: string) {
  const seconds = Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000);
  if (!Number.isFinite(seconds)) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours ? `${hours}h ` : ""}${minutes}m`;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values: number[], mean = average(values)) {
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(1, values.length));
}

function downsample(samples: SensorSample[], maximum = 700) {
  if (samples.length <= maximum) return samples;
  const result: SensorSample[] = [];
  const bucketSize = samples.length / maximum;
  for (let bucket = 0; bucket < maximum; bucket += 1) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * bucketSize));
    result.push(samples[Math.min(samples.length - 1, Math.floor((start + end - 1) / 2))]);
  }
  return result;
}

function TimeSeriesPanel({ samples, metric, title }: { samples: SensorSample[]; metric: Metric; title: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const gradientId = useId().replaceAll(":", "");
  const chartSamples = useMemo(() => downsample(samples), [samples]);
  const values = chartSamples.map((sample) => sample[metric]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(maximum - minimum, metric === "temperature" ? 1 : 2);
  const lower = minimum - spread * 0.16;
  const upper = maximum + spread * 0.16;
  const left = 64;
  const right = 782;
  const top = 30;
  const bottom = 238;
  const xFor = (index: number) => left + (index / Math.max(1, chartSamples.length - 1)) * (right - left);
  const yFor = (value: number) => bottom - ((value - lower) / (upper - lower)) * (bottom - top);
  const path = chartSamples.map((sample, index) => `${index ? "L" : "M"}${xFor(index).toFixed(2)},${yFor(sample[metric]).toFixed(2)}`).join(" ");
  const areaPath = `${path} L${right},${bottom} L${left},${bottom} Z`;
  const active = hoverIndex === null ? null : chartSamples[hoverIndex];
  const color = metric === "temperature" ? "#f2b84b" : "#5794f2";
  const unit = metric === "temperature" ? "°C" : "%";

  function onPointerMove(event: React.PointerEvent<SVGRectElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    setHoverIndex(Math.round(progress * Math.max(0, chartSamples.length - 1)));
  }

  return (
    <article className="grafana-panel trend-panel">
      <header className="grafana-panel-header">
        <h3>{title}</h3>
        <span>{minimum.toFixed(1)}–{maximum.toFixed(1)} {unit}</span>
      </header>
      <div className="trend-chart">
        <svg viewBox="0 0 800 275" role="img" aria-label={`${title} chart`}>
          <defs>
            <linearGradient id={`${gradientId}-stroke`} x1="0" y1="1" x2="0" y2="0">
              {metric === "temperature" ? <>
                <stop offset="0%" stopColor="#73bf69" />
                <stop offset="58%" stopColor="#fade2a" />
                <stop offset="100%" stopColor="#f2495c" />
              </> : <>
                <stop offset="0%" stopColor="#5794f2" />
                <stop offset="100%" stopColor="#73c7ff" />
              </>}
            </linearGradient>
            <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.34" />
              <stop offset="100%" stopColor={color} stopOpacity="0.015" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((line) => {
            const y = top + (line / 4) * (bottom - top);
            const value = upper - (line / 4) * (upper - lower);
            return <g key={line}>
              <line className="chart-grid-line" x1={left} y1={y} x2={right} y2={y} />
              <text className="chart-axis-label" x={left - 10} y={y + 4} textAnchor="end">{value.toFixed(1)} {unit}</text>
            </g>;
          })}
          {[0, 0.25, 0.5, 0.75, 1].map((progress) => {
            const index = Math.round(progress * Math.max(0, chartSamples.length - 1));
            const sample = chartSamples[index];
            const x = left + progress * (right - left);
            return <g key={progress}>
              <line className="chart-grid-line" x1={x} y1={top} x2={x} y2={bottom} />
              <text className="chart-axis-label" x={x} y={bottom + 24} textAnchor={progress === 0 ? "start" : progress === 1 ? "end" : "middle"}>
                {sample ? new Date(sample.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
              </text>
            </g>;
          })}
          <path d={areaPath} fill={`url(#${gradientId}-fill)`} />
          <path d={path} fill="none" stroke={`url(#${gradientId}-stroke)`} strokeWidth={metric === "temperature" ? 3 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
          {active && hoverIndex !== null && <g>
            <line className="chart-crosshair" x1={xFor(hoverIndex)} y1={top} x2={xFor(hoverIndex)} y2={bottom} />
            <circle cx={xFor(hoverIndex)} cy={yFor(active[metric])} r="5" fill={color} stroke="#111217" strokeWidth="2" />
          </g>}
          <rect className="chart-pointer-layer" x={left} y={top} width={right - left} height={bottom - top} onPointerMove={onPointerMove} onPointerLeave={() => setHoverIndex(null)} />
        </svg>
        {active && hoverIndex !== null && <div className="chart-tooltip" style={{ left: `${Math.min(82, Math.max(18, (hoverIndex / Math.max(1, chartSamples.length - 1)) * 100))}%` }}>
          <span>{new Date(active.timestamp).toLocaleString()}</span>
          <strong><i style={{ background: color }} />{active[metric].toFixed(1)} {unit}</strong>
        </div>}
      </div>
    </article>
  );
}

function arcPath(startAngle: number, endAngle: number, radius = 92) {
  const point = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return [130 + radius * Math.cos(radians), 120 + radius * Math.sin(radians)];
  };
  const [startX, startY] = point(startAngle);
  const [endX, endY] = point(endAngle);
  return `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;
}

function GaugePanel({ samples, metric, title }: { samples: SensorSample[]; metric: Metric; title: string }) {
  const values = samples.map((sample) => sample[metric]);
  const mean = average(values);
  const deviation = standardDeviation(values, mean);
  const isTemperature = metric === "temperature";
  const maximum = isTemperature ? 70 : 100;
  const unit = isTemperature ? "°C" : "%";
  const thresholds = isTemperature
    ? [{ from: 0, to: 35, color: "#73bf69" }, { from: 35, to: 60, color: "#ff9830" }, { from: 60, to: 70, color: "#f2495c" }]
    : [{ from: 0, to: 70, color: "#5794f2" }, { from: 70, to: 85, color: "#ff9830" }, { from: 85, to: 100, color: "#f2495c" }];
  const valueAngle = -180 + (Math.min(maximum, Math.max(0, mean)) / maximum) * 180;
  const activeColor = thresholds.find((threshold) => mean >= threshold.from && mean <= threshold.to)?.color || thresholds[0].color;

  return (
    <article className="grafana-panel gauge-panel">
      <header className="grafana-panel-header"><h3>{title}</h3></header>
      <div className="gauge-layout">
        <svg viewBox="0 0 260 155" role="img" aria-label={`${title}: ${mean.toFixed(1)} ${unit}`}>
          {thresholds.map((threshold) => (
            <path
              key={threshold.from}
              d={arcPath(-180 + (threshold.from / maximum) * 180, -180 + (threshold.to / maximum) * 180)}
              fill="none"
              stroke={threshold.color}
              strokeOpacity="0.35"
              strokeWidth="18"
            />
          ))}
          <path d={arcPath(-180, valueAngle)} fill="none" stroke={activeColor} strokeWidth="18" />
          <text className="gauge-value" x="130" y="105" textAnchor="middle">{mean.toFixed(1)} {unit}</text>
          <text className="gauge-label" x="130" y="130" textAnchor="middle">Avg</text>
          <text className="gauge-limit" x="25" y="142">0</text>
          <text className="gauge-limit" x="235" y="142" textAnchor="end">{maximum}</text>
        </svg>
        <div className="gauge-stats">
          <span>Standard deviation</span>
          <strong>{deviation.toFixed(2)} {unit}</strong>
          <small>Min {Math.min(...values).toFixed(1)} · Max {Math.max(...values).toFixed(1)}</small>
        </div>
      </div>
    </article>
  );
}

function PrintCard({ job, onOpen }: { job: PrintJob; onOpen: () => void }) {
  return (
    <button className="print-job-card" type="button" onClick={onOpen}>
      <span className="print-job-preview">
        {job.previewUrl
          ? <img src={job.previewUrl} alt="" />
          : <span className="preview-placeholder" aria-hidden="true">M</span>}
        <span className="print-job-open">View data <b>↗</b></span>
      </span>
      <span className="print-job-copy">
        <strong>{job.metadata.file_name || "Unnamed print"}</strong>
        <span>{formatDate(job.metadata.end_time)}</span>
        <span>{job.samples.length.toLocaleString()} samples · {formatDuration(job.metadata.start_time, job.metadata.end_time)}</span>
      </span>
    </button>
  );
}

function PrintDetail({ job }: { job: PrintJob }) {
  return (
    <div className="print-detail">
      <div className="detail-heading">
        <div className="detail-preview">
          {job.previewUrl ? <img src={job.previewUrl} alt={`Preview of ${job.metadata.file_name}`} /> : <span>No preview</span>}
        </div>
        <div>
          <p className="data-eyebrow">Print job sensor data</p>
          <h2>{job.metadata.file_name}</h2>
          <p>Environmental conditions recorded throughout this print.</p>
        </div>
      </div>
      <dl className="metadata-grid">
        <div><dt>Job UUID</dt><dd>{job.metadata.job_uuid}</dd></div>
        <div><dt>Print started</dt><dd>{formatDate(job.metadata.start_time)}</dd></div>
        <div><dt>Print completed</dt><dd>{formatDate(job.metadata.end_time)}</dd></div>
        <div><dt>Duration</dt><dd>{formatDuration(job.metadata.start_time, job.metadata.end_time)}</dd></div>
        <div><dt>Sensor samples</dt><dd>{job.samples.length.toLocaleString()}</dd></div>
        <div><dt>Export generated</dt><dd>{formatDate(job.metadata.export_generated_at)}</dd></div>
      </dl>
      <div className="grafana-grid">
        <TimeSeriesPanel samples={job.samples} metric="temperature" title="Temperature Trend" />
        <GaugePanel samples={job.samples} metric="temperature" title="Average Temperature" />
        <TimeSeriesPanel samples={job.samples} metric="humidity" title="Humidity Trend" />
        <GaugePanel samples={job.samples} metric="humidity" title="Average Humidity" />
      </div>
    </div>
  );
}

export default function PrintDataExplorer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);
  const [archiveName, setArchiveName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    jobs.forEach((job) => { if (job.previewUrl) URL.revokeObjectURL(job.previewUrl); });
  }, [jobs]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function loadFile(file?: File) {
    if (!file || loading) return;
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const parsed = await parsePrintArchive(file);
      jobs.forEach((job) => { if (job.previewUrl) URL.revokeObjectURL(job.previewUrl); });
      setJobs(parsed);
      setSelectedJob(null);
      setArchiveName(file.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The ZIP could not be opened.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function goBack() {
    if (selectedJob) {
      setSelectedJob(null);
      return;
    }
    setOpen(false);
  }

  return <>
    <input
      ref={inputRef}
      className="print-data-file-input"
      type="file"
      accept=".zip,application/zip"
      onChange={(event) => void loadFile(event.target.files?.[0])}
    />
    <button className="header-data-link" type="button" onClick={() => inputRef.current?.click()}>
      Upload data
    </button>
    {open && <div className="print-data-modal" role="dialog" aria-modal="true" aria-label="Print history data">
      <div className="print-data-modal-bar">
        <button className="modal-back-button" type="button" onClick={goBack}>
          ← {selectedJob ? "All printed parts" : "Back"}
        </button>
        <span>{selectedJob ? selectedJob.metadata.file_name : archiveName || "Print history explorer"}</span>
        <button className="modal-upload-button" type="button" onClick={() => inputRef.current?.click()} disabled={loading}>
          Upload ZIP
        </button>
      </div>
      <section className="print-data-section">
        <div className="print-data-shell">
        {loading && <div className="archive-status" role="status">
          <span className="archive-spinner" aria-hidden="true" />
          <strong>Reading print history…</strong>
          <p>Loading thumbnails, metadata, and sensor samples.</p>
        </div>}
        {!loading && error && <div className="archive-status archive-status-error" role="alert">
          <strong>Unable to open this archive</strong>
          <p>{error}</p>
          <button type="button" onClick={() => inputRef.current?.click()}>Choose another ZIP</button>
        </div>}
        {!loading && !error && !selectedJob && jobs.length > 0 && <>
          <div className="print-grid-heading">
            <div><p className="data-eyebrow">Imported archive</p><h3>{jobs.length} printed part{jobs.length === 1 ? "" : "s"}</h3></div>
            <span>{archiveName}</span>
          </div>
          <div className="print-job-grid">
            {jobs.map((job) => <PrintCard key={job.metadata.job_uuid} job={job} onOpen={() => setSelectedJob(job)} />)}
          </div>
        </>}
        {!loading && !error && selectedJob && <PrintDetail job={selectedJob} />}
        </div>
      </section>
    </div>}
  </>;
}
