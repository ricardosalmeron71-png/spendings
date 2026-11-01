import { Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Line, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { compactMoney } from '@/lib/format';
import { useColors } from '@/lib/theme';

/** Dona por categorías */
export function Donut({
  data,
  size = 180,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  data: { value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const c = useColors();
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.cardAlt} strokeWidth={thickness} fill="none" />
          {total > 0 &&
            data.map((d, i) => {
              const len = (d.value / total) * circ;
              const gap = data.length > 1 ? Math.min(3, len / 3) : 0;
              const el = (
                <Circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={d.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${Math.max(0, len - gap)} ${circ}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  fill="none"
                />
              );
              offset += len;
              return el;
            })}
        </G>
      </Svg>
      {centerValue && <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>{centerValue}</Text>}
      {centerLabel && <Text style={{ fontSize: 12, color: c.textMuted }}>{centerLabel}</Text>}
    </View>
  );
}

/** Barras dobles ingreso/gasto por mes */
export function IncomeExpenseBars({
  data,
  width,
  height = 180,
}: {
  data: { label: string; income: number; expense: number }[];
  width: number;
  height?: number;
}) {
  const c = useColors();
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const chartH = height - 28;
  const groupW = width / Math.max(1, data.length);
  const barW = Math.min(16, groupW / 3.2);
  return (
    <Svg width={width} height={height}>
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <Line key={p} x1={0} x2={width} y1={chartH - chartH * p} y2={chartH - chartH * p} stroke={c.border} strokeDasharray="4 4" />
      ))}
      {data.map((d, i) => {
        const x = i * groupW + groupW / 2;
        const hi = (d.income / max) * (chartH - 14);
        const he = (d.expense / max) * (chartH - 14);
        return (
          <G key={i}>
            <Rect x={x - barW - 2} y={chartH - hi} width={barW} height={hi} rx={4} fill={c.income} />
            <Rect x={x + 2} y={chartH - he} width={barW} height={he} rx={4} fill={c.expense} />
            <SvgText x={x} y={height - 8} fontSize={11} fill={c.textMuted} textAnchor="middle">
              {d.label}
            </SvgText>
          </G>
        );
      })}
      <SvgText x={2} y={10} fontSize={10} fill={c.textMuted}>
        {compactMoney(max)}
      </SvgText>
    </Svg>
  );
}

/** Línea acumulada del mes vs. presupuesto ideal */
export function CumulativeLine({
  values,
  budget,
  width,
  height = 160,
  todayIndex,
}: {
  values: number[];
  budget?: number;
  width: number;
  height?: number;
  todayIndex?: number;
}) {
  const c = useColors();
  const n = values.length;
  const max = Math.max(1, budget ?? 0, ...values) * 1.1;
  const x = (i: number) => (i / Math.max(1, n - 1)) * width;
  const y = (v: number) => height - (v / max) * height;
  const upto = todayIndex !== undefined ? values.slice(0, todayIndex + 1) : values;
  const path = upto.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const area = upto.length ? `${path} L${x(upto.length - 1)},${height} L0,${height} Z` : '';
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.primary} stopOpacity={0.35} />
          <Stop offset="1" stopColor={c.primary} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {budget ? (
        <>
          <Line x1={0} y1={height} x2={width} y2={y(budget)} stroke={c.textMuted} strokeDasharray="5 5" strokeWidth={1.5} />
          <Line x1={0} y1={y(budget)} x2={width} y2={y(budget)} stroke={c.expense} strokeOpacity={0.5} strokeWidth={1} />
        </>
      ) : null}
      {area ? <Path d={area} fill="url(#g)" /> : null}
      {path ? <Path d={path} stroke={c.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" /> : null}
      {upto.length > 0 && <Circle cx={x(upto.length - 1)} cy={y(upto[upto.length - 1])} r={4.5} fill={c.primary} />}
    </Svg>
  );
}

/** Barras horizontales simples (por miembro, forma de pago, etc.) */
export function HBars({ data }: { data: { label: string; value: number; color: string }[] }) {
  const c = useColors();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 10 }}>
      {data.map((d) => (
        <View key={d.label}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
              {d.label}
            </Text>
            <Text style={{ color: c.textMuted, fontVariant: ['tabular-nums'] }}>{compactMoney(d.value)}</Text>
          </View>
          <View style={{ height: 10, backgroundColor: c.cardAlt, borderRadius: 5 }}>
            <View style={{ width: `${(d.value / max) * 100}%`, height: 10, backgroundColor: d.color, borderRadius: 5 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
