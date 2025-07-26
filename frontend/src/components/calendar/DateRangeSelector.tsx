import { DateRangeType } from '../../types';
import { DATE_RANGE_OPTIONS } from '../../utils/constants';

interface DateRangeSelectorProps {
  selectedRange: DateRangeType;
  onRangeChange: (range: DateRangeType) => void;
}

const DateRangeSelector = ({
  selectedRange,
  onRangeChange,
}: DateRangeSelectorProps) => {
  return (
    <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
      {DATE_RANGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onRangeChange(option.value)}
          className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            selectedRange === option.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default DateRangeSelector;