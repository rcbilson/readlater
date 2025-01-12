import React from "react";

interface Props {
  contents?: string;
  isPending: boolean;
  onSearch: (searchText: string) => void;
}

const SearchBar: React.FC<Props> = ({contents, isPending, onSearch}: Props) => {
  const handleSearchTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSearch(event.target.value);
  };

  return (
    <div id="searchbar">
      <input id="url" type="text" value={contents} onChange={handleSearchTextChange} />
    </div>
  )
};

export default SearchBar;
