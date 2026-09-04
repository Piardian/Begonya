import { ExecutionContext } from './executionContext';
import { ExecutionPlanItem } from './executionPlanItem';
import { ExecutionRuntimePolicy, RuntimeAdapterType } from './executionRuntimePolicy';
import { RuntimeItem } from './runtimeItem';

export interface RuntimeAdapter {
  readonly adapterType: RuntimeAdapterType;

  prepare(
    item: ExecutionPlanItem,
    context: ExecutionContext,
    policy: ExecutionRuntimePolicy
  ): RuntimeItem;
}
