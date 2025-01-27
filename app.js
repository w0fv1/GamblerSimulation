document.addEventListener('alpine:init', () => {
  Alpine.data('simulator', () => ({
    // 默认配置参数
    numExperiments: 5,
    winRate: 50,
    winMultiplier: 1,
    lowerLimit: 100,
    upperLimit: 1000,
    numBalanceLevels: 2,
    betAmount: 50,
    // 运行状态
    isRunning: false,
    worker: null,
    progress: '0%',
    logs: [],
    tableData: [],

    // 初始化
    init() {
      console.log('Initializing simulator with the following parameters:');
      console.log(`Number of experiments: ${this.numExperiments}`);
      console.log(`Win rate: ${this.winRate}%`);
      console.log(`Bet amount: ${this.betAmount}`);
      this.initChart();
      this.addLog('系统就绪', 'info');
    },

    // 图表初始化
    initChart() {
      console.log('Initializing chart...');
      this.chart = echarts.init(document.getElementById('main-chart'));
      this.resetChart();
    },

    // 主运行函数
    async start() {
      try {
        this.isRunning = true;
        console.log('Simulation started...');
        console.log('Resetting data and initializing worker...');
        this.resetData();
        
        // 创建 Web Worker
        this.worker = new Worker('worker.js');
        console.log('Web Worker created');
        
        // 设置消息监听
        this.worker.onmessage = (e) => {
          const { type, data } = e.data;
          console.log(`Worker message received: ${type}`, data);
        
          switch (type) {
            case 'progress':
              this.progress = `${data}%`;
              console.log(`Progress: ${this.progress}`);
              break;
            case 'result':
              console.log('Processing result...');
              this.updateData(data.balance, data.results);
              this.updateChart(data.balance, data.results);
              break;
            case 'complete':
              console.log('Simulation complete.');
              this.isRunning = false;
              this.worker.terminate();
              this.worker = null;
              this.addLog('模拟完成', 'success');
              break;
            case 'error':
              console.error('Error in worker:', data.message);
              throw new Error(data.message);
          }
        };

        // 发送配置参数
        console.log('Sending configuration to worker:', this.getWorkerConfig());
        this.worker.postMessage({
          type: 'start',
          config: this.getWorkerConfig()
        });
      } catch (error) {
        this.handleError(error);
      }
    },

    // 获取 Worker 配置
    getWorkerConfig() {
      console.log('Getting worker config...');
      return {
        numExperiments: this.numExperiments,
        winRate: this.winRate,
        winMultiplier: this.winMultiplier,
        lowerLimit: this.lowerLimit,
        upperLimit: this.upperLimit,
        numBalanceLevels: this.numBalanceLevels,
        betAmount: this.betAmount,
      };
    },

    // 中止操作
    abort() {
      console.log('Aborting simulation...');
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
        this.isRunning = false;
        this.addLog('操作已中止', 'warning');
      } else {
        console.log('No worker to terminate.');
      }
    },

    // 数据重置
    resetData() {
      console.log('Resetting data...');
      this.logs = [];
      this.tableData = [];
      this.resetChart();
    },

    // 图表重置
    resetChart() {
      console.log('Resetting chart...');
      this.chart.setOption({
        title: { text: '本金与赌博次数关系', left: 'center' },
        tooltip: {
          trigger: 'axis',
          formatter: params => {
            let tip = `本金: ${params[0].value[0].toFixed(2)}<br>`;
            params.forEach(p => {
              tip += `${p.marker} ${p.seriesName}: ${p.value[1].toFixed(2)}次<br>`;
            });
            return tip;
          }
        },
        legend: { data: ['平均次数', '最佳次数', '最差次数'], bottom: 10 },
        xAxis: {
          type: 'log',
          name: '初始本金',
          axisLabel: { formatter: value => value.toFixed(2) }
        },
        yAxis: {
          type: 'log',
          name: '赌博次数',
          axisLabel: { formatter: value => value.toFixed(2) }
        },
        dataZoom: [{ type: 'inside' }],
        grid: { top: 80, bottom: 80, containLabel: true },
        series: [
          this.createSeries('平均次数', '#5470C6'),
          this.createSeries('最佳次数', '#91CC75'),
          this.createSeries('最差次数', '#FAC858')
        ]
      });
    },

    // 更新数据
    updateData(balance, { avg, best, worst }) {
      console.log(`Updating data for balance: ${balance}`);
      this.tableData.push({ 
        balance: balance.toFixed(2),
        avg: avg.toFixed(2),
        best: best.toFixed(2),
        worst: worst.toFixed(2)
      });
      this.addLog(
        `本金 ${balance.toFixed(2)}: ` +
        `平均 ${avg.toFixed(2)}次 | ` +
        `范围 ${worst.toFixed(2)}-${best.toFixed(2)}次`
      );
    },

    // 更新图表
    updateChart(balance, { avg, best, worst }) {
      console.log(`Updating chart with balance: ${balance}, Avg: ${avg}, Best: ${best}, Worst: ${worst}`);
      const option = this.chart.getOption();
      option.series[0].data.push([balance, avg]);
      option.series[1].data.push([balance, best]);
      option.series[2].data.push([balance, worst]);
      this.chart.setOption(option, { replaceMerge: ['series'] });
    },

    // 导出功能
    exportCSV() {
      console.log('Exporting data to CSV...');
      const csv = [
        '初始本金,平均次数,最佳次数,最差次数',
        ...this.tableData.map(r => `${r.balance},${r.avg},${r.best},${r.worst}`)
      ].join('\n');
      this.downloadFile('results.csv', csv);
      console.log('CSV export complete.');
    },

    exportJSON() {
      console.log('Exporting data to JSON...');
      const data = {
        parameters: this.getWorkerConfig(),
        results: this.tableData
      };
      this.downloadFile('results.json', JSON.stringify(data, null, 2));
      console.log('JSON export complete.');
    },

    // 辅助方法
    createSeries(name, color) {
      console.log(`Creating series: ${name}, color: ${color}`);
      return { name, type: 'scatter', symbolSize: 10, itemStyle: { color }, data: [] };
    },

    addLog(message, type = 'info') {
      console.log(`[${new Date().toLocaleTimeString()}] ${type.toUpperCase()}: ${message}`);
      this.logs.unshift({
        time: new Date().toLocaleTimeString(),
        message,
        type
      });
    },

    downloadFile(filename, content) {
      console.log(`Downloading file: ${filename}`);
      const blob = new Blob([content], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    },

    handleError(error) {
      console.error('An error occurred:', error);
      this.isRunning = false;
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }
      this.addLog(`错误: ${error.message}`, 'error');
    }
  }));
});