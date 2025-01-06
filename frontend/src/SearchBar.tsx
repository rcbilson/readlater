import React, { useState } from "react";

interface Props {
  contents?: string;
  isPending: boolean;
  onSearch: (searchText: string) => void;
}

const SearchBar: React.FC<Props> = ({contents, isPending, onSearch}: Props) => {
  const [searchText, setSearchText] = useState(contents ?? "");

  const handleSearchTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
  };
  
  const handleButtonClick = () => {
    onSearch(searchText);
  };

  let buttonText;
  let buttonDisabled = false;
  if (isPending) {
    buttonText = "Loading...";
    buttonDisabled = true;
  } else if (searchText == contents) {
    buttonText = "Refresh";
  } else {
    buttonText = "Load";
  }

  return (
    <div id="searchbar">
      <input id="url" type="text" value={searchText} onChange={handleSearchTextChange} />
      <button onClick={handleButtonClick} disabled={buttonDisabled}>{buttonText}</button>
    </div>
  )
};

export default SearchBar;
