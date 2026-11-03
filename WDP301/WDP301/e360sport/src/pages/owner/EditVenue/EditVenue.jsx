import { useParams } from 'react-router-dom'
import AddVenue from '../AddVenue/AddVenue'

//Form sửa thông tin địa điểm
export default function EditVenue() {
  const { id } = useParams()
  return <AddVenue editMode venueId={id} />
}
