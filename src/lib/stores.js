import { writable } from 'svelte/store';

export const activeData = writable(null);
export const activeModel = writable(null); // active graph node/element
export const graph = writable({
    mains: {
        0: { id: 0, lat: 40.72046126415034, lng: -74.01205133801675, neighbors: [1], type: 'main' },
        1: { id: 1, lat: 40.718704858576665, lng: -74.012652628157, neighbors: [0, 2], type: 'main' },
        2: { id: 2, lat: 40.71711104304284, lng: -74.01286737463566, neighbors: [1, 3], type: 'main' },
        3: { id: 3, lat: 40.715159380215596, lng: -74.01333981688872, neighbors: [2, 4], type: 'main' },
        4: { id: 4, lat: 40.71346789281921, lng: -74.01376930984607, neighbors: [3, 5], type: 'main' },
        5: { id: 5, lat: 40.71180889228491, lng: -74.01428470139483, neighbors: [4, 6], type: 'main' },
        6: { id: 6, lat: 40.70979201243498, lng: -74.0148859915351, neighbors: [5, 7], type: 'main' },
        7: { id: 7, lat: 40.70784013505986, lng: -74.01574497744976, neighbors: [6, 8], type: 'main' },
        8: { id: 8, lat: 40.70601833122571, lng: -74.01638921688576, neighbors: [7, 9], type: 'main' },
        9: { id: 9, lat: 40.70448927882712, lng: -74.01651806477295, neighbors: [8, 10], type: 'main' },
        10: { id: 10, lat: 40.70442421198891, lng: -74.0147571436479, neighbors: [9, 11, 26], type: 'main' },
        11: { id: 11, lat: 40.7030252595921, lng: -74.01471419435218, neighbors: [10, 12], type: 'main' },
        12: { id: 12, lat: 40.70230950514283, lng: -74.01441354928204, neighbors: [11, 13], type: 'main' },
        13: { id: 13, lat: 40.70169134738322, lng: -74.01355456336739, neighbors: [12, 14], type: 'main' },
        14: { id: 14, lat: 40.70133346395292, lng: -74.01110645351064, neighbors: [13, 15], type: 'main' },
        15: { id: 15, lat: 40.701984159668676, lng: -74.00951732956854, neighbors: [14, 16], type: 'main' },
        16: { id: 16, lat: 40.70361087114778, lng: -74.00698332112029, neighbors: [15, 17], type: 'main' },
        17: { id: 17, lat: 40.70500981124441, lng: -74.00453521126354, neighbors: [16, 18], type: 'main' },
        18: { id: 18, lat: 40.706896707153156, lng: -74.00157170985798, neighbors: [17, 19], type: 'main' },
        19: { id: 19, lat: 40.70797026199809, lng: -73.9993812957756, neighbors: [18, 20, 21], type: 'main' },
        20: { id: 20, lat: 40.70985707402882, lng: -74.00182940563238, neighbors: [19, 21], type: 'main' },
        21: { id: 21, lat: 40.711711302730876, lng: -74.00401981971474, neighbors: [20, 22], type: 'main' },
        22: { id: 22, lat: 40.7121667194259, lng: -74.00582369013551, neighbors: [21, 23], type: 'main' },
        23: { id: 23, lat: 40.711776362449456, lng: -74.00801410421786, neighbors: [22, 24], type: 'main' },
        24: { id: 24, lat: 40.71086552060471, lng: -74.00908783661119, neighbors: [23, 25], type: 'main' },
        25: { id: 25, lat: 40.708165451928735, lng: -74.0114500478765, neighbors: [24, 26], type: 'main' },
        26: { id: 26, lat: 40.70494474491473, lng: -74.01385289973591, neighbors: [25, 10], type: 'main' }
    },
    loc: {
    }
});

export const chunks = writable({});

export const powerSources = writable([]);
export const powerIndicators = writable([]);

export const initialPowerSources = [
  {
    id: 8304878670,
    lat: 40.7162289,
    lng: -74.014699,
    info: { code: 'S', color: '#FFD700' },
    name: 'Solar Generator'
  },
  {
    id: 742054629,
    lat: 40.712587,
    lng: -74.0034475,
    info: { code: 'S', color: '#FFD700' },
    name: 'Solar Photovoltaic Panel'
  },
  {
    id: 1006719175,
    lat: 40.6921502,
    lng: -74.0122472,
    info: { code: 'D', color: '#00FF88' },
    name: 'Diesel Generator'
  },
  {
    id: 1389556294,
    lat: 40.6912799,
    lng: -74.0193638,
    info: { code: 'S', color: '#FFD700' },
    name: 'Solar Photovoltaic Panel'
  },
  {
    id: 1389556295,
    lat: 40.6913111,
    lng: -74.0192412,
    info: { code: 'S', color: '#FFD700' },
    name: 'Solar Photovoltaic Panel'
  },
  {
    id: 1457797800,
    lat: 40.7128018,
    lng: -74.0062233,
    info: { code: 'S', color: '#FFD700' },
    name: 'Solar Photovoltaic Panel'
  },
  {
    id: 1457797801,
    lat: 40.7126138,
    lng: -74.005849,
    info: { code: 'S', color: '#FFD700' },
    name: 'Solar Photovoltaic Panel'
  }
];
