"use client";

import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart,
  LineElement,
  LinearScale,
  CategoryScale,
  PointElement,
  Legend,
  Tooltip,
} from "chart.js";
import { useWS } from "@/hooks/useWS";

Chart.register(
  LineElement,
  LinearScale,
  CategoryScale,
  PointElement,
  Legend,
  Tooltip
);

export default function Dashboard() {
  // const { data } = useWS(); // {type:'telemetry', data:{distance_cm, pwm, ts...}}

  const { data, readyState } = useWS("ws://localhost:7072");

  const [dist, setDist] = useState<number[]>([]);
  const [pwm, setPwm] = useState<number[]>([]);
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    if (!data || data.type !== "telemetry") return;

    // 필드명/단위 매핑
    // distance_mm → cm로 변환
    const mm = Number(data.data.distance_mm);
    const cm = Number.isFinite(mm) ? Math.round((mm / 10) * 10) / 10 : null; // 0.1 cm 단위

    // servo_us(500~2500us) → 0~180도로 변환
    const us = Number(data.data.servo_us);
    const deg = Number.isFinite(us)
      ? Math.max(0, Math.min(180, Math.round(((us - 500) * 180) / 2000)))
      : null;

    const t = new Date(data.data.ts || Date.now()).toLocaleTimeString();
    setLabels((l) => [...l.slice(-99), t]);
    setDist((d) => [...d.slice(-99), cm ?? (null as any)]);
    setPwm((d) => [...d.slice(-99), deg ?? (null as any)]);
  }, [data]);

  const commonOpts = useMemo(
    () => ({
      animation: false,
      responsive: true,
      maintainAspectRatio: false, // 부모 div 높이(h-64) 사용
      plugins: { legend: { display: true }, tooltip: { intersect: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { maxRotation: 0, autoSkip: true } },
      },
      elements: {
        point: { radius: 0 },
        line: { borderWidth: 2, tension: 0.2 },
      },
    }),
    []
  );

  const distChart = useMemo(
    () => ({
      labels,
      datasets: [{ label: "Distance (cm)", data: dist }],
    }),
    [labels, dist]
  );

  const pwmChart = useMemo(
    () => ({
      labels,
      datasets: [{ label: "Speed (PWM)", data: pwm }],
    }),
    [labels, pwm]
  );

  return (
    <main className="min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Robot Workcell Dashboard</h1>
            <p className="text-sm text-gray-500">
              Real-time sensing & control • STM32 • Next.js
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            live
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* 상단 카드: 상태 요약 */}
        <StatusCards lastDist={dist.at(-1)} lastPwm={pwm.at(-1)} />

        {/* 차트 2개 */}
        <section className="grid md:grid-cols-2 gap-6">
          <Card title="Distance (cm)">
            <div className="h-64">
              <Line data={distChart} options={commonOpts} />
            </div>
          </Card>
          <Card title="Speed (PWM)">
            <div className="h-64">
              <Line data={pwmChart} options={commonOpts} />
            </div>
          </Card>
        </section>

        {/* 컨트롤 + 로그 */}
        <section className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1" title="Controls">
            <Controls />
          </Card>
          <Card className="lg:col-span-2" title="Logs">
            <Logs />
          </Card>
        </section>
      </div>
    </main>
  );
}

function Card(props: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { title, children, className } = props;
  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${
        className || ""
      }`}
    >
      {title && (
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">{title}</h2>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatusCards({
  lastDist,
  lastPwm,
}: {
  lastDist?: number;
  lastPwm?: number;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-4">
        <div className="text-xs text-blue-700/80">Latest Distance</div>
        <div className="mt-1 text-3xl font-semibold text-blue-900">
          {lastDist ?? "—"}
        </div>
        <div className="text-xs text-blue-700/60 mt-1">cm</div>
      </div>
      <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-4">
        <div className="text-xs text-emerald-700/80">Current PWM</div>
        <div className="mt-1 text-3xl font-semibold text-emerald-900">
          {lastPwm ?? "—"}
        </div>
        <div className="text-xs text-emerald-700/60 mt-1">0–180</div>
      </div>
    </div>
  );
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.99] disabled:opacity-50 ${
        className || ""
      }`}
    />
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-50 ${
        className || ""
      }`}
    />
  );
}

function DangerButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded-lg bg-rose-600 text-white px-3 py-2 text-sm hover:bg-rose-500 active:scale-[0.99] disabled:opacity-50 ${
        className || ""
      }`}
    />
  );
}

function Controls() {
  const [led, setLed] = useState(false);
  const [pwm, setPwm] = useState(120);
  const [dir, setDir] = useState<"left" | "right">("left");
  const [lock, setLock] = useState(30);

  async function post(type: string, body: any) {
    const res = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...body }),
    });
    if (!res.ok) alert("command failed");
  }

  return (
    <div className="space-y-4">
      {/* LED */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">LED</label>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <span className="text-xs text-gray-500">{led ? "ON" : "OFF"}</span>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={led}
            onChange={(e) => {
              setLed(e.target.checked);
              post("led", { on: e.target.checked });
            }}
          />
          <span className="h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-emerald-500 relative transition-colors">
            <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-all peer-checked:left-5 shadow" />
          </span>
        </label>
      </div>

      {/* PWM */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Speed (PWM)
          </label>
          <span className="text-xs text-gray-500">{pwm}</span>
        </div>
        <input
          type="range"
          min={0}
          max={180}
          value={pwm}
          onChange={(e) => setPwm(+e.target.value)}
          onMouseUp={() => post("set_speed", { pwm })}
          className="w-full accent-indigo-600"
        />
      </div>

      {/* Direction */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-2">Direction</div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setDir("left");
              post("direction", { value: "left" });
            }}
            className={dir === "left" ? "border-indigo-400 bg-indigo-50" : ""}
          >
            Left
          </Button>
          <Button
            onClick={() => {
              setDir("right");
              post("direction", { value: "right" });
            }}
            className={dir === "right" ? "border-indigo-400 bg-indigo-50" : ""}
          >
            Right
          </Button>
        </div>
      </div>

      {/* Lock */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Lock (deg)
          </label>
          <span className="text-xs text-gray-500">{lock}</span>
        </div>
        <input
          type="range"
          min={0}
          max={90}
          value={lock}
          onChange={(e) => setLock(+e.target.value)}
          onMouseUp={() => post("lock", { deg: lock })}
          className="w-full accent-indigo-600"
        />
      </div>

      {/* E-STOP */}
      <DangerButton onClick={() => post("estop", {})} className="w-full">
        E-STOP
      </DangerButton>
    </div>
  );
}

function Logs() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/logs?limit=100");
      setRows(await r.json());
    })();
  }, []);

  const badge = (lv: string) => {
    if (lv === "error") return "bg-rose-100 text-rose-700 ring-1 ring-rose-200";
    if (lv === "warn")
      return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
    return "bg-gray-100 text-gray-700 ring-1 ring-gray-200";
    // info
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-2 pl-4 pr-2 text-left font-medium text-gray-600">
              ts
            </th>
            <th className="px-2 py-2 text-left font-medium text-gray-600">
              level
            </th>
            <th className="px-2 py-2 text-left font-medium text-gray-600">
              action
            </th>
            <th className="px-2 py-2 text-left font-medium text-gray-600">
              payload
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="py-2 pl-4 pr-2 tabular-nums text-gray-700">
                {r.ts}
              </td>
              <td className="px-2 py-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${badge(
                    r.level
                  )}`}
                >
                  {r.level}
                </span>
              </td>
              <td className="px-2 py-2 text-gray-700">{r.action}</td>
              <td className="px-2 py-2">
                <pre className="whitespace-pre-wrap text-gray-600">
                  {r.payload}
                </pre>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-gray-500">
                No logs yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
