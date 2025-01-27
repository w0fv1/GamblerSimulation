class SimulationWorker {
  constructor() {
    this.abortController = null; // 初始化中止控制器，用于控制模拟任务是否中止
    this.initListeners(); // 初始化消息监听器
    console.log("SimulationWorker 已初始化"); // 初始化 Worker 时输出日志
  }

  // 初始化 Worker 消息监听器
  initListeners() {
    self.onmessage = async (e) => {
      const { type, config } = e.data; // 解构消息中的 type 和 config 数据
      console.log("接收到消息:", e.data); // 输出接收到的消息

      if (type === "start") { // 如果是启动指令
        this.abortController = new AbortController(); // 创建新的中止控制器
        console.log("模拟开始，配置:", config); // 输出启动配置
        this.runSimulation(config); // 启动模拟
      }
    };
  }

  // 运行模拟
  async runSimulation(config) {
    try {
      console.log("正在运行模拟，配置:", config); // 输出模拟开始时的配置

      const balances = this.generateBalanceLevels(config); // 生成余额梯度
      console.log("生成的余额级别:", balances); // 输出生成的余额级别

      const total = balances.length; // 计算总共有多少个余额级别
      console.log("总余额级别数:", total); // 输出总余额级别数

      // 对每个余额级别进行实验
      for (const [index, balance] of balances.entries()) {
        if (this.abortController.signal.aborted) {
          console.log("模拟任务被中止");
          break; // 如果任务被中止，停止实验
        } // 如果任务被中止，停止实验

        // 发送当前进度到主线程，进度是根据已完成的实验数计算的
        const progress = Math.round((index + 1) / total * 100);
        console.log(`当前进度: ${progress}%`); // 输出当前进度
        self.postMessage({
          type: "progress",
          data: progress, // 计算进度百分比并发送
        });
        console.log("开始进行下一轮实验, 余额:", balance); // 输出开始实验时的余额

        // 运行实验并获取结果
        const results = await this.runExperiments(config, balance);

        // 发送实验结果到主线程
        console.log(`余额 ${balance} 的实验结果:`, results); // 输出当前余额的实验结果
        self.postMessage({
          type: "result",
          data: {
            balance, // 当前余额
            results: { // 当前余额下的实验统计结果
              avg: results.avg, // 平均步骤数
              best: results.best, // 最多步骤数
              worst: results.worst, // 最少步骤数
            },
          },
        });
      }

      // 所有实验完成后，发送完成消息
      console.log("模拟完成");
      self.postMessage({ type: "complete" });
    } catch (error) {
      // 如果发生错误，发送错误信息到主线程
      console.error("模拟过程中发生错误:", error); // 输出错误信息
      self.postMessage({
        type: "error",
        data: { message: error.message }, // 发送错误消息
      });
    }
  }

  // 根据配置生成余额梯度
  generateBalanceLevels(config) {
    const minLog = Math.log10(config.lowerLimit); // 计算下限的对数值
    const maxLog = Math.log10(config.upperLimit); // 计算上限的对数值
    const step = (maxLog - minLog) / (config.numBalanceLevels - 1); // 计算每个级别之间的对数步长

    // 使用对数级别生成从下限到上限的余额
    const levels = Array.from(
      { length: config.numBalanceLevels },
      (_, i) => 10 ** (minLog + i * step),
    ); // 根据对数步长生成余额
    console.log("生成的余额梯度:", levels); // 输出生成的余额梯度
    return levels;
  }

  // 批量运行实验
  async runExperiments(config, balance) {
    const results = { steps: [] };
    const batchSize = 100;

    for (let i = 0; i < config.numExperiments; i += batchSize) {
      if (this.abortController.signal.aborted) break;

      const end = Math.min(i + batchSize, config.numExperiments);
      for (let j = i; j < end; j++) {
        // 将每次实验的结果存入数组
        const steps = this.runSingleExperiment(config, balance);
        results.steps.push(steps);
      }
    }

    // 添加空数组检查
    if (results.steps.length === 0) {
      return { avg: 0, best: 0, worst: 0 };
    }

    return {
      avg: results.steps.reduce((a, b) => a + b, 0) / results.steps.length,
      best: Math.max(...results.steps),
      worst: Math.min(...results.steps),
    };
  }
  runSingleExperiment(config, initial) {
    // 单次实验逻辑runSingleExperiment(config, initial) {
    let current = initial;
    let steps = 0;
    let winCount = 0; // 统计赢的次数
    let resultArray = []; // 记录每次实验的获胜或失败情况
    console.log(config);

    while (current >= config.betAmount) {
      if (this.abortController.signal.aborted) break;

      steps++;

      const isWin = Math.random() < config.winRate / 100;
      const r = config.betAmount * config.winMultiplier *
        (isWin
          ? 1 // 赢了，增加金额
          : -1); // 输了，减少金额
      current += r; // 更新余额

      // 输出每次赌博的情况
      console.log(
        `Step: ${steps},  ${
          isWin ? "Win" : "Lose"
        }, Bet: ${config.betAmount}, ` +
          `Result: ${r.toFixed(2)}, Current Balance: ${current.toFixed(2)}`,
      );

      // 统计赢的次数
      if (isWin) {
        winCount++;
        resultArray.push("Win"); // 将“Win”添加到结果数组
      } else {
        resultArray.push("Lose"); // 将“Lose”添加到结果数组
      }

      // 防止浮点数精度问题
      current = Math.round(current * 100) / 100;
    }

    // 计算赢的比例
    const winRatio = steps > 0 ? winCount / steps : 0;
    console.log(
      `Win ratio: ${winRatio}`,
      `Win count: ${winCount}`,
      `Steps: ${steps}`,
      `Results: ${resultArray.join(", ")}`, // 输出整个实验的获胜失败结果
    );

    return steps;
  }
}
// 启动 Worker 实例
new SimulationWorker();
