import type * as echartsCore from 'echarts/core';

type EChartsRuntime = typeof echartsCore;

let runtimePromise: Promise<EChartsRuntime> | undefined;

/**
 * Load and register the small ECharts surface used by chart elements.
 *
 * Keeping this behind a shared promise matters for two reasons: charts stay
 * optional for slides that only render text/images, and multiple charts on one
 * slide do not race to register the same ECharts extensions. Top-level
 * `echarts/charts` imports also fail module evaluation under Next/Turbopack
 * SSR; deferring the import to the client mount avoids that.
 */
export function loadChartRuntime(): Promise<EChartsRuntime> {
  runtimePromise ??= Promise.all([
    import('echarts/core'),
    import('echarts/charts'),
    import('echarts/components'),
    import('echarts/renderers'),
    import('echarts/features'),
  ]).then(([echarts, charts, components, renderers, features]) => {
    echarts.use([
      charts.BarChart,
      charts.LineChart,
      charts.PieChart,
      charts.ScatterChart,
      charts.RadarChart,
      components.LegendComponent,
      renderers.SVGRenderer,
    ]);
    // ECharts 6 makes the ECharts 5 containLabel layout an opt-in feature.
    if (features.LegacyGridContainLabel) echarts.use(features.LegacyGridContainLabel);
    return echarts;
  });

  return runtimePromise;
}
