import { ExecutionContext } from './executionContext';
import { ExecutionPlanItem } from './executionPlanItem';
import { ExecutionRuntimePolicy } from './executionRuntimePolicy';
import { RuntimeAdapter } from './runtimeAdapter';
import { RuntimeItem } from './runtimeItem';
import { createRuntimeItem } from './runtimeItemFactory';

export class SimulationRuntimeAdapter implements RuntimeAdapter {
  readonly adapterType = 'SIMULATION' as const;

  prepare(
    item: ExecutionPlanItem,
    context: ExecutionContext,
    policy: ExecutionRuntimePolicy
  ): RuntimeItem {
    return createRuntimeItem({
      item,
      context,
      policy,
      adapter: this.adapterType,
      runtimeStatus: 'PREPARED',
      reasonCode: 'SIMULATION_ACTION_PREPARED',
      reasonMessage: 'Plan-only action prepared for simulation runtime. No execution was performed.',
    });
  }
}
