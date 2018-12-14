// @flow
import BitMap from '../../consumer/bit-map/bit-map';

export interface AddHookInterface {
  onDidLoadBitmapFile?: (bitMap: BitMap) => void;
}
