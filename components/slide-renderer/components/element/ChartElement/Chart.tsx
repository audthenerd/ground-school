'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import tinycolor from 'tinycolor2';
import type { ChartData, ChartOptions, ChartType } from '@openmaic/dsl';
import { getChartOption } from './chartOption';
import { loadChartRuntime } from './chartRuntime';

interface ChartProps {
  width: number;
  height: number;
  type: ChartType;
  data: ChartData;
  themeColors: string[];
  textColor?: string;
  lineColor?: string;
  options?: ChartOptions;
}

export function Chart({
  width: _width,
  height: _height,
  type,
  data,
  themeColors: rawThemeColors,
  textColor,
  lineColor,
  options,
}: ChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<import('echarts/core').ECharts | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const updateOptionRef = useRef<() => void>(() => undefined);

  // Generate theme colors
  const themeColors = useMemo(() => {
    let colors: string[] = [];
    if (rawThemeColors.length >= 10) {
      colors = rawThemeColors;
    } else if (rawThemeColors.length === 1) {
      colors = tinycolor(rawThemeColors[0])
        .analogous(10)
        .map((color) => color.toRgbString());
    } else {
      const len = rawThemeColors.length;
      const supplement = tinycolor(rawThemeColors[len - 1])
        .analogous(10 + 1 - len)
        .map((color) => color.toRgbString());
      colors = [...rawThemeColors.slice(0, len - 1), ...supplement];
    }
    return colors;
  }, [rawThemeColors]);

  const updateOption = useCallback(() => {
    if (!chartInstance.current) return;

    const option = getChartOption({
      type,
      data,
      themeColors,
      textColor,
      lineColor,
      lineSmooth: options?.lineSmooth || false,
      stack: options?.stack || false,
    });

    if (option) {
      chartInstance.current.setOption(option, true);
    }
  }, [type, data, themeColors, textColor, lineColor, options]);

  useEffect(() => {
    updateOptionRef.current = updateOption;
  }, [updateOption]);

  // Initialize chart after the optional ECharts runtime loads on the client.
  useEffect(() => {
    let mounted = true;

    void loadChartRuntime()
      .then((echarts) => {
        if (!mounted || !chartRef.current) return;

        chartInstance.current = echarts.init(chartRef.current, null, {
          renderer: 'svg',
        });
        updateOptionRef.current();

        const resizeObserver = new ResizeObserver(() => {
          chartInstance.current?.resize();
        });
        resizeObserver.observe(chartRef.current);
        resizeObserverRef.current = resizeObserver;
      })
      .catch(() => {
        // Leave the empty chart host in place; option updates no-op until ready.
      });

    return () => {
      mounted = false;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  // Update chart when props change
  useEffect(() => {
    updateOption();
  }, [updateOption]);

  return <div ref={chartRef} className="chart w-full h-full" />;
}
