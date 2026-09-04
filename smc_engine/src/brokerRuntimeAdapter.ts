import { ExecutionContext } from './executionContext';
import { ExecutionPlanItem } from './executionPlanItem';
import { ExecutionRuntimePolicy } from './executionRuntimePolicy';
import { RuntimeAdapter } from './runtimeAdapter';
import { RuntimeItem } from './runtimeItem';
import { createRuntimeItem } from './runtimeItemFactory';

export class BrokerRuntimeAdapter implements RuntimeAdapter {
  readonly adapterType = 'BROKER' as const;

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
      runtimeStatus: 'BLOCKED',
      reasonCode: 'BROKER_RUNTIME_RESERVED',
      reasonMessage: 'Broker runtime is reserved. Sprint 9 performs no broker execution.',
    });
  }
}
