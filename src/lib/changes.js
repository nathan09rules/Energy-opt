import { graph, activeData } from './stores.js';
import { optimize } from './optamize.js';
import { updateLayerProperties } from './map.js';

export function validate(property, value, activeDataValue) {
  const num = parseFloat(value);
  if (isNaN(num) || num <= 0) return;
  const rounded = parseFloat(num.toPrecision(3));
  graph.update(g => {
    if (g.loc[activeDataValue.id]) {
      g.loc[activeDataValue.id][property] = rounded;
    }
    return g;
  });
  activeData.update(data => ({ ...data, [property]: rounded }));
  updateLayerProperties(activeDataValue.id, { [property]: rounded });
  // Recalculate optimization and reset ledger when any value changes
  const newLedger = optimize() || [];
  console.log(newLedger);
  return { newLedger };
}
